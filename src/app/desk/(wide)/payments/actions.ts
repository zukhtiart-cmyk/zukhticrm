"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contractorBills, contractorPayments, db, workOrders } from "@/db";
import { requireUser } from "@/lib/auth";
import { notifyPayee } from "@/lib/payouts";
import { PAYMENT_MODES } from "@/lib/site-costs";
import { findContractor, formFile, scopedProject } from "@/lib/site-ops";
import { saveFile } from "@/lib/storage";

export type FormState = { error?: string; ok?: string; at?: number } | undefined;

const schema = z.object({
  contractorId: z.string().min(1, "Choose who you paid"),
  projectId: z.string().min(1, "Choose the project"),
  workOrderId: z.string().optional().transform((v) => v || null),
  billId: z.string().optional().transform((v) => v || null),
  kind: z.enum(["ADVANCE", "WAGES", "BILL", "OTHER"]),
  amount: z.coerce.number().positive("Enter the amount paid").max(100_000_000),
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().trim().max(120).optional().transform((v) => v || null),
  note: z.string().trim().max(500).optional().transform((v) => v || null),
  paidOn: z.string().optional(),
});

function refresh(projectId: string | null, contractorId: string) {
  revalidatePath("/desk/payments");
  revalidatePath("/desk/contractors", "layout");
  revalidatePath(`/desk/contractors/${contractorId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

/** Owner and accounts only. Records a payout to a contractor or labourer against a project. */
export async function recordPayment(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("payouts");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const [contractor, project] = await Promise.all([findContractor(user, d.contractorId), scopedProject(user, d.projectId)]);
  if (!contractor) return { error: "Contractor not found" };
  if (!project) return { error: "Project not found" };

  let workOrderId = d.workOrderId;
  let billId = d.billId;
  if (d.kind === "BILL") {
    if (!billId) return { error: "Choose which approved bill this pays" };
    const bill = await db.query.contractorBills.findFirst({ where: eq(contractorBills.id, billId), with: { workOrder: true } });
    if (!bill || bill.workOrder.contractorId !== contractor.id || bill.workOrder.projectId !== project.id) return { error: "That bill isn't for this contractor and project" };
    if (bill.status !== "APPROVED") return { error: bill.status === "PAID" ? "That bill is already paid" : "Only approved bills can be paid" };
    if (Math.abs(bill.amount - d.amount) > 0.5) return { error: `The bill is for ${bill.amount.toLocaleString("en-IN")} — record the full amount, or pay the difference as an advance.` };
    workOrderId = bill.workOrderId;
  } else billId = null;
  if (workOrderId) {
    const wo = await db.query.workOrders.findFirst({ where: and(eq(workOrders.id, workOrderId), eq(workOrders.contractorId, contractor.id), eq(workOrders.projectId, project.id)) });
    if (!wo) return { error: "That work order isn't for this contractor and project" };
  }
  const f = formFile(form, "receipt");
  if (f.error) return { error: f.error };
  const receiptUrl = f.file ? await saveFile(f.file, `bills/${project.id}`) : null;
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
  if (billId) await db.update(contractorBills).set({ status: "PAID", paidAt: paidOn, reference: d.reference }).where(eq(contractorBills.id, billId));

  let note = "";
  if (form.get("notify") === "on") {
    const amount = `${project.office.currency} ${d.amount.toLocaleString("en-IN")}`;
    note = ` WhatsApp: ${await notifyPayee(contractor.phone, contractor.name, `Payment of ${amount} made by ${d.mode}${d.reference ? ` (ref ${d.reference})` : ""} for ${project.name}. — Zukhti Home accounts`)}.`;
  }
  refresh(project.id, contractor.id);
  return { ok: `Recorded ${project.office.currency} ${d.amount.toLocaleString("en-IN")} paid to ${contractor.name}.${note}`, at: Date.now() };
}

/** Owner only: remove a payment entered by mistake (re-opens the bill if it paid one). */
export async function deletePayment(form: FormData) {
  const user = await requireUser("payouts");
  if (user.role !== "OWNER") return;
  const p = await db.query.contractorPayments.findFirst({ where: eq(contractorPayments.id, String(form.get("id"))) });
  if (!p || (p.projectId && !(await scopedProject(user, p.projectId)))) return;
  await db.delete(contractorPayments).where(eq(contractorPayments.id, p.id));
  if (p.billId) await db.update(contractorBills).set({ status: "APPROVED", paidAt: null }).where(eq(contractorBills.id, p.billId));
  refresh(p.projectId, p.contractorId);
}
