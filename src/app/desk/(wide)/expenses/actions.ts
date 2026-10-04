"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, siteExpenses } from "@/db";
import { requireUser } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/site-costs";
import { formFile, scopedProject } from "@/lib/site-ops";
import { saveFile } from "@/lib/storage";

export type FormState = { error?: string; ok?: string; at?: number } | undefined;

const schema = z.object({
  projectId: z.string().min(1, "Choose a project"),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(2, "What was it for?").max(300),
  paidTo: z.string().trim().max(120).optional(),
  amount: z.coerce.number().positive("Enter the amount").max(10_000_000),
  spentOn: z.string().optional(),
});

function refresh(projectId: string) {
  revalidatePath("/desk/expenses");
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function addExpense(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("expenses");
  const parsed = schema.safeParse(Object.fromEntries(form));
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
  refresh(project.id);
  return { ok: `Saved ${project.office.currency} ${d.amount.toLocaleString("en-IN")} for ${project.name}. Waiting for approval.`, at: Date.now() };
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
  const exp = await db.query.siteExpenses.findFirst({ where: eq(siteExpenses.id, id) });
  if (!exp || !(await scopedProject(user, exp.projectId))) return;
  if (exp.submittedById === user.id && user.role !== "OWNER") return;
  const note = String(form.get("note") ?? "").trim() || null;
  const status = decision === "approve" ? "APPROVED" : decision === "reject" ? "REJECTED" : decision === "paid" ? "PAID" : null;
  if (!status) return;
  if (status === "PAID" && exp.status !== "APPROVED") return;
  await db.update(siteExpenses).set({ status, reviewedById: user.id, reviewedAt: new Date(), reviewNote: note ?? exp.reviewNote }).where(eq(siteExpenses.id, id));
  refresh(exp.projectId);
}

/** The person who logged it can withdraw it while it's pending. */
export async function withdrawExpense(form: FormData) {
  const user = await requireUser("expenses");
  const exp = await db.query.siteExpenses.findFirst({ where: eq(siteExpenses.id, String(form.get("id"))) });
  if (!exp || exp.submittedById !== user.id || exp.status !== "PENDING") return;
  await db.delete(siteExpenses).where(eq(siteExpenses.id, exp.id));
  refresh(exp.projectId);
}
