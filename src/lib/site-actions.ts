import "server-only";
/**
 * Save logic shared by the screens, the Zuki assistant and WhatsApp Zuki.
 * Each function takes the acting user explicitly and checks their role and office itself,
 * so it works without a browser login (e.g. from the WhatsApp webhook).
 */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  contractorBills,
  contractorPayments,
  db,
  siteExpenses,
  snags,
  workOrders,
} from "@/db";
import type { Role } from "@/db/schema";
import { can } from "./permissions";
import { notifyPayee } from "./payouts";
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from "./site-costs";
import { findContractor, formFile, scopedProject } from "./site-ops";
import { saveFile } from "./storage";

export type Actor = {
  id: string;
  name: string;
  role: Role;
  officeId: string | null;
};
export type SaveResult =
  { error?: string; ok?: string; at?: number } | undefined;

const deny = { error: "Your role isn't allowed to do this." };

// ---------- Payments to contractors / labour ----------

const paySchema = z.object({
  contractorId: z.string().min(1, "Choose who you paid"),
  projectId: z.string().min(1, "Choose the project"),
  workOrderId: z
    .string()
    .optional()
    .transform((v) => v || null),
  billId: z
    .string()
    .optional()
    .transform((v) => v || null),
  kind: z.enum(["ADVANCE", "WAGES", "BILL", "OTHER"]),
  amount: z.coerce.number().positive("Enter the amount paid").max(100_000_000),
  mode: z.enum(PAYMENT_MODES),
  reference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
  paidOn: z.string().optional(),
});

function refreshPayment(projectId: string | null, contractorId: string) {
  revalidatePath("/desk/payments");
  revalidatePath("/desk/contractors", "layout");
  revalidatePath(`/desk/contractors/${contractorId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

export async function recordPaymentAs(
  user: Actor,
  form: FormData,
): Promise<SaveResult> {
  if (!can(user.role, "payouts")) return deny;
  const parsed = paySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const [contractor, project] = await Promise.all([
    findContractor(user, d.contractorId),
    scopedProject(user, d.projectId),
  ]);
  if (!contractor) return { error: "Contractor not found" };
  if (!project) return { error: "Project not found" };

  let workOrderId = d.workOrderId;
  let billId = d.billId;
  if (d.kind === "BILL") {
    if (!billId) return { error: "Choose which approved bill this pays" };
    const bill = await db.query.contractorBills.findFirst({
      where: eq(contractorBills.id, billId),
      with: { workOrder: true },
    });
    if (
      !bill ||
      bill.workOrder.contractorId !== contractor.id ||
      bill.workOrder.projectId !== project.id
    )
      return { error: "That bill isn't for this contractor and project" };
    if (bill.status !== "APPROVED")
      return {
        error:
          bill.status === "PAID"
            ? "That bill is already paid"
            : "Only approved bills can be paid",
      };
    if (Math.abs(bill.amount - d.amount) > 0.5)
      return {
        error: `The bill is for ${bill.amount.toLocaleString("en-IN")} — record the full amount, or pay the difference as an advance.`,
      };
    workOrderId = bill.workOrderId;
  } else billId = null;
  if (workOrderId) {
    const wo = await db.query.workOrders.findFirst({
      where: and(
        eq(workOrders.id, workOrderId),
        eq(workOrders.contractorId, contractor.id),
        eq(workOrders.projectId, project.id),
      ),
    });
    if (!wo)
      return { error: "That work order isn't for this contractor and project" };
  }
  const f = formFile(form, "receipt");
  if (f.error) return { error: f.error };
  const receiptUrl = f.file
    ? await saveFile(f.file, `bills/${project.id}`)
    : null;
  const paidOn = d.paidOn ? new Date(`${d.paidOn}T12:00:00`) : new Date();

  await db.insert(contractorPayments).values({
    contractorId: contractor.id,
    projectId: project.id,
    workOrderId,
    billId,
    kind: d.kind,
    amount: d.amount,
    currency: project.office.currency,
    mode: d.mode,
    reference: d.reference,
    note: d.note,
    receiptUrl,
    paidOn: Number.isNaN(paidOn.getTime()) ? new Date() : paidOn,
    paidById: user.id,
  });
  if (billId)
    await db
      .update(contractorBills)
      .set({ status: "PAID", paidAt: paidOn, reference: d.reference })
      .where(eq(contractorBills.id, billId));

  let note = "";
  if (form.get("notify") === "on") {
    const amount = `${project.office.currency} ${d.amount.toLocaleString("en-IN")}`;
    note = ` WhatsApp: ${await notifyPayee(contractor.phone, contractor.name, `Payment of ${amount} made by ${d.mode}${d.reference ? ` (ref ${d.reference})` : ""} for ${project.name}. — Zukhti Home accounts`)}.`;
  }
  refreshPayment(project.id, contractor.id);
  return {
    ok: `Recorded ${project.office.currency} ${d.amount.toLocaleString("en-IN")} paid to ${contractor.name}.${note}`,
    at: Date.now(),
  };
}

// ---------- Site expenses ----------

const expenseSchema = z.object({
  projectId: z.string().min(1, "Choose a project"),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(2, "What was it for?").max(300),
  paidTo: z.string().trim().max(120).optional(),
  amount: z.coerce.number().positive("Enter the amount").max(10_000_000),
  spentOn: z.string().optional(),
});

function refreshExpense(projectId: string) {
  revalidatePath("/desk/expenses");
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function addExpenseAs(
  user: Actor,
  form: FormData,
): Promise<SaveResult> {
  if (!can(user.role, "expenses")) return deny;
  const parsed = expenseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const project = await scopedProject(user, d.projectId);
  if (!project) return { error: "Project not found" };
  const f = formFile(form, "bill");
  if (f.error) return { error: f.error };
  let billUrl: string | null = null;
  if (f.file) {
    try {
      billUrl = await saveFile(f.file, `bills/${project.id}`);
    } catch (e) {
      return { error: `Bill photo not saved: ${(e as Error).message}` };
    }
  }
  const spentOn = d.spentOn ? new Date(`${d.spentOn}T12:00:00`) : new Date();
  await db.insert(siteExpenses).values({
    projectId: project.id,
    category: d.category,
    description: d.description,
    paidTo: d.paidTo || null,
    amount: d.amount,
    currency: project.office.currency,
    billUrl,
    spentOn: Number.isNaN(spentOn.getTime()) ? new Date() : spentOn,
    submittedById: user.id,
  });
  refreshExpense(project.id);
  return {
    ok: `Saved ${project.office.currency} ${d.amount.toLocaleString("en-IN")} for ${project.name}. Waiting for approval.`,
    at: Date.now(),
  };
}

// ---------- Snags ----------

function refreshSnag(projectId: string) {
  revalidatePath("/desk/snags");
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/portal", "layout");
}

export async function addSnagAs(
  user: Actor,
  form: FormData,
): Promise<SaveResult> {
  if (!can(user.role, "snags")) return deny;
  const project = await scopedProject(user, String(form.get("projectId")));
  if (!project) return { error: "Project not found" };
  const description = String(form.get("description") ?? "").trim();
  if (description.length < 3) return { error: "Describe the snag" };
  const f = formFile(form, "photo");
  if (f.error) return { error: f.error };
  const contractorId = String(form.get("contractorId") ?? "");
  const contractor = contractorId
    ? await findContractor(user, contractorId)
    : null;
  const photoUrl = f.file
    ? await saveFile(f.file, `photos/${project.id}`)
    : null;
  await db.insert(snags).values({
    projectId: project.id,
    room: String(form.get("room") ?? "").trim() || "General",
    description: description.slice(0, 500),
    photoUrl,
    contractorId: contractor?.id ?? null,
    createdById: user.id,
  });
  refreshSnag(project.id);
  return { ok: "Snag added.", at: Date.now() };
}

// ---------- Contractor running bills ----------

async function loadWo(user: Actor, id: string) {
  const wo = await db.query.workOrders.findFirst({
    where: eq(workOrders.id, id),
  });
  if (!wo || !(await scopedProject(user, wo.projectId))) return null;
  return wo;
}

function refreshBill(wo?: {
  number: string;
  projectId: string;
  contractorId: string;
}) {
  revalidatePath("/desk/contractors", "layout");
  if (wo) revalidatePath(`/projects/${wo.projectId}`, "layout");
}

export async function submitBillAs(
  user: Actor,
  form: FormData,
): Promise<SaveResult> {
  if (!can(user.role, "contractors")) return deny;
  const wo = await loadWo(user, String(form.get("workOrderId")));
  if (!wo) return { error: "Work order not found" };
  if (wo.status === "CANCELLED")
    return { error: "This work order is cancelled." };
  const amount = Number(form.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "Enter the bill amount" };
  const existing = await db
    .select()
    .from(contractorBills)
    .where(eq(contractorBills.workOrderId, wo.id));
  const billed = existing
    .filter((b) => b.status !== "REJECTED")
    .reduce((a, b) => a + b.amount, 0);
  if (billed + amount > wo.amount + 0.5)
    return {
      error: `Bills would total ${wo.currency} ${(billed + amount).toLocaleString("en-IN")}, more than the work order (${wo.currency} ${wo.amount.toLocaleString("en-IN")}). Ask the owner or accounts to revise the work order first.`,
    };
  const f = formFile(form, "bill");
  if (f.error) return { error: f.error };
  const billUrl = f.file
    ? await saveFile(f.file, `bills/${wo.projectId}`)
    : null;
  await db
    .insert(contractorBills)
    .values({
      workOrderId: wo.id,
      amount,
      note: String(form.get("note") ?? "").trim() || null,
      billUrl,
      submittedById: user.id,
    });
  refreshBill(wo);
  return { ok: "Bill submitted for approval.", at: Date.now() };
}
