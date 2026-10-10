"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, siteExpenses } from "@/db";
import { addExpenseAs } from "@/lib/site-actions";
import { requireUser } from "@/lib/auth";
import { scopedProject } from "@/lib/site-ops";

export type FormState =
  { error?: string; ok?: string; at?: number } | undefined;

function refresh(projectId: string) {
  revalidatePath("/desk/expenses");
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function addExpense(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser("expenses");
  return addExpenseAs(user, form);
}

/** Approve, reject or mark reimbursed. Only owner/admin/accounts; nobody but the owner approves their own expense. */
export async function approveExpense(form: FormData) {
  return review(form, "approve");
}
export async function rejectExpense(form: FormData) {
  return review(form, "reject");
}
export async function reimburseExpense(form: FormData) {
  return review(form, "paid");
}

async function review(form: FormData, decision: "approve" | "reject" | "paid") {
  const user = await requireUser("approve");
  const id = String(form.get("id"));
  const exp = await db.query.siteExpenses.findFirst({
    where: eq(siteExpenses.id, id),
  });
  if (!exp || !(await scopedProject(user, exp.projectId))) return;
  if (exp.submittedById === user.id && user.role !== "OWNER") return;
  const note = String(form.get("note") ?? "").trim() || null;
  const status =
    decision === "approve"
      ? "APPROVED"
      : decision === "reject"
        ? "REJECTED"
        : decision === "paid"
          ? "PAID"
          : null;
  if (!status) return;
  if (status === "PAID" && exp.status !== "APPROVED") return;
  await db
    .update(siteExpenses)
    .set({
      status,
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: note ?? exp.reviewNote,
    })
    .where(eq(siteExpenses.id, id));
  refresh(exp.projectId);
}

/** The person who logged it can withdraw it while it's pending. */
export async function withdrawExpense(form: FormData) {
  const user = await requireUser("expenses");
  const exp = await db.query.siteExpenses.findFirst({
    where: eq(siteExpenses.id, String(form.get("id"))),
  });
  if (!exp || exp.submittedById !== user.id || exp.status !== "PENDING") return;
  await db.delete(siteExpenses).where(eq(siteExpenses.id, exp.id));
  refresh(exp.projectId);
}
