"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contractorBills, contractorPayments, contractors, db, workOrders } from "@/db";
import { can } from "@/lib/permissions";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { officeScope } from "@/lib/permissions";
import { PAYMENT_MODES, TRADES } from "@/lib/site-costs";
import { findContractor, formFile, nextWorkOrderNumber, scopedProject } from "@/lib/site-ops";
import { saveFile } from "@/lib/storage";

export type FormState = { error?: string; ok?: string; at?: number } | undefined;
const opt = z.string().trim().max(500).optional().transform((v) => v || null);

async function loadWo(user: CurrentUser, id: string) {
  const wo = await db.query.workOrders.findFirst({ where: eq(workOrders.id, id) });
  if (!wo || !(await scopedProject(user, wo.projectId))) return null;
  return wo;
}

function refresh(wo?: { number: string; projectId: string; contractorId: string }) {
  revalidatePath("/desk/contractors", "layout");
  if (wo) revalidatePath(`/projects/${wo.projectId}`, "layout");
}

const contractorSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  trade: z.enum(TRADES),
  phone: opt,
  officeId: opt,
  rateNotes: opt,
  bankDetails: opt,
});

export async function saveContractor(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("contractors");
  const parsed = contractorSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const scope = officeScope(user);
  const values = { ...parsed.data, officeId: scope ?? parsed.data.officeId };
  const id = String(form.get("id") ?? "");
  if (id) {
    if (!(await findContractor(user, id))) return { error: "Contractor not found" };
    await db.update(contractors).set({ ...values, active: form.get("active") !== "off" }).where(eq(contractors.id, id));
    refresh();
    return { ok: "Saved", at: Date.now() };
  }
  const [c] = await db.insert(contractors).values(values).returning();
  refresh();
  redirect(`/desk/contractors/${c.id}`);
}

const woSchema = z.object({
  contractorId: z.string().min(1),
  projectId: z.string().min(1, "Choose a project"),
  stageId: opt,
  title: z.string().trim().min(2, "Give the work a short title").max(160),
  scope: z.string().trim().max(4000).optional().transform((v) => v || null),
  amount: z.coerce.number().positive("Enter the agreed amount"),
});

export async function createWorkOrder(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("contractors");
  const parsed = woSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const [project, contractor] = await Promise.all([scopedProject(user, d.projectId), findContractor(user, d.contractorId)]);
  if (!project) return { error: "Project not found" };
  if (!contractor) return { error: "Contractor not found" };
  const stageId = d.stageId && project.stages.some((s) => s.id === d.stageId) ? d.stageId : null;
  let number = await nextWorkOrderNumber();
  for (let i = 0; i < 3; i++) {
    try {
      await db.insert(workOrders).values({ number, projectId: project.id, contractorId: contractor.id, stageId, title: d.title, scope: d.scope, amount: d.amount, currency: project.office.currency, createdById: user.id });
      break;
    } catch (e) {
      if (i === 2 || !/unique|duplicate/i.test(String((e as Error).message))) throw e;
      number = await nextWorkOrderNumber();
    }
  }
  refresh({ number, projectId: project.id, contractorId: contractor.id });
  redirect(`/desk/contractors/wo/${number}`);
}

/** Approvers can change the agreed amount (variations) and close or cancel a work order. */
export async function updateWorkOrder(form: FormData) {
  const user = await requireUser("approve");
  const wo = await loadWo(user, String(form.get("id")));
  if (!wo) return;
  const bills = await db.select().from(contractorBills).where(eq(contractorBills.workOrderId, wo.id));
  const billed = bills.filter((b) => b.status !== "REJECTED").reduce((a, b) => a + b.amount, 0);
  const raw = Number(form.get("amount"));
  // Never below what's already billed.
  const amount = Number.isFinite(raw) && raw > 0 ? Math.max(raw, billed) : wo.amount;
  const status = String(form.get("status") ?? wo.status);
  await db
    .update(workOrders)
    .set({
      amount,
      status: (["OPEN", "DONE", "CANCELLED"] as const).find((s) => s === status) ?? wo.status,
    })
    .where(eq(workOrders.id, wo.id));
  refresh(wo);
}

export async function submitBill(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("contractors");
  const wo = await loadWo(user, String(form.get("workOrderId")));
  if (!wo) return { error: "Work order not found" };
  if (wo.status === "CANCELLED") return { error: "This work order is cancelled." };
  const amount = Number(form.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the bill amount" };
  const existing = await db.select().from(contractorBills).where(eq(contractorBills.workOrderId, wo.id));
  const billed = existing.filter((b) => b.status !== "REJECTED").reduce((a, b) => a + b.amount, 0);
  if (billed + amount > wo.amount + 0.5)
    return { error: `Bills would total ${wo.currency} ${(billed + amount).toLocaleString("en-IN")}, more than the work order (${wo.currency} ${wo.amount.toLocaleString("en-IN")}). Ask the owner or accounts to revise the work order first.` };
  const f = formFile(form, "bill");
  if (f.error) return { error: f.error };
  const billUrl = f.file ? await saveFile(f.file, `bills/${wo.projectId}`) : null;
  await db.insert(contractorBills).values({ workOrderId: wo.id, amount, note: String(form.get("note") ?? "").trim() || null, billUrl, submittedById: user.id });
  refresh(wo);
  return { ok: "Bill submitted for approval.", at: Date.now() };
}

export async function approveBill(form: FormData) {
  return reviewBill(form, "approve");
}
export async function rejectBill(form: FormData) {
  return reviewBill(form, "reject");
}
export async function payBill(form: FormData) {
  return reviewBill(form, "paid");
}

async function reviewBill(form: FormData, decision: "approve" | "reject" | "paid") {
  const user = await requireUser("approve");
  const bill = await db.query.contractorBills.findFirst({ where: eq(contractorBills.id, String(form.get("id"))) });
  if (!bill) return;
  const wo = await loadWo(user, bill.workOrderId);
  if (!wo) return;
  if (decision === "approve" && bill.status === "PENDING") {
    await db.update(contractorBills).set({ status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() }).where(eq(contractorBills.id, bill.id));
  } else if (decision === "reject" && bill.status === "PENDING") {
    await db.update(contractorBills).set({ status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), note: [bill.note, String(form.get("reason") ?? "").trim()].filter(Boolean).join(" — Rejected: ") || bill.note }).where(eq(contractorBills.id, bill.id));
  } else if (decision === "paid" && bill.status === "APPROVED") {
    // Paying is for owner and accounts only, and every payment goes on the contractor's ledger.
    if (!can(user.role, "payouts")) return;
    const reference = String(form.get("reference") ?? "").trim() || null;
    const modeRaw = String(form.get("mode") ?? "");
    const mode = (PAYMENT_MODES as readonly string[]).includes(modeRaw) ? modeRaw : "Bank transfer";
    await db.insert(contractorPayments).values({
      contractorId: wo.contractorId,
      projectId: wo.projectId,
      workOrderId: wo.id,
      billId: bill.id,
      kind: "BILL",
      amount: bill.amount,
      currency: wo.currency,
      mode,
      reference,
      paidById: user.id,
    });
    await db.update(contractorBills).set({ status: "PAID", paidAt: new Date(), reference }).where(eq(contractorBills.id, bill.id));
    revalidatePath("/desk/payments");
  }
  refresh(wo);
}
