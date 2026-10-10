"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { contractorBills, contractorPayments, db } from "@/db";
import { recordPaymentAs } from "@/lib/site-actions";
import { requireUser } from "@/lib/auth";
import { scopedProject } from "@/lib/site-ops";

export type FormState =
  { error?: string; ok?: string; at?: number } | undefined;

function refresh(projectId: string | null, contractorId: string) {
  revalidatePath("/desk/payments");
  revalidatePath("/desk/contractors", "layout");
  revalidatePath(`/desk/contractors/${contractorId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

/** Owner and accounts only. Records a payout to a contractor or labourer against a project. */
export async function recordPayment(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser("payouts");
  return recordPaymentAs(user, form);
}

/** Owner only: remove a payment entered by mistake (re-opens the bill if it paid one). */
export async function deletePayment(form: FormData) {
  const user = await requireUser("payouts");
  if (user.role !== "OWNER") return;
  const p = await db.query.contractorPayments.findFirst({
    where: eq(contractorPayments.id, String(form.get("id"))),
  });
  if (!p || (p.projectId && !(await scopedProject(user, p.projectId)))) return;
  await db.delete(contractorPayments).where(eq(contractorPayments.id, p.id));
  if (p.billId)
    await db
      .update(contractorBills)
      .set({ status: "APPROVED", paidAt: null })
      .where(eq(contractorBills.id, p.billId));
  refresh(p.projectId, p.contractorId);
}
