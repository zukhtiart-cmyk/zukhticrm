"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, snags } from "@/db";
import { addSnagAs } from "@/lib/site-actions";
import { requireUser } from "@/lib/auth";
import { formFile, scopedProject } from "@/lib/site-ops";
import { saveFile } from "@/lib/storage";

export type FormState =
  { error?: string; ok?: string; at?: number } | undefined;

function refresh(projectId: string) {
  revalidatePath("/desk/snags");
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/portal", "layout");
}

async function load(id: string) {
  const user = await requireUser("snags");
  const snag = await db.query.snags.findFirst({ where: eq(snags.id, id) });
  if (!snag || !(await scopedProject(user, snag.projectId))) return null;
  return { user, snag };
}

export async function addSnag(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser("snags");
  return addSnagAs(user, form);
}

export async function markFixed(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const r = await load(String(form.get("id")));
  if (!r) return { error: "Snag not found" };
  const f = formFile(form, "photo");
  if (f.error) return { error: f.error };
  const fixedPhotoUrl = f.file
    ? await saveFile(f.file, `photos/${r.snag.projectId}`)
    : r.snag.fixedPhotoUrl;
  await db
    .update(snags)
    .set({ status: "FIXED", fixedAt: new Date(), fixedPhotoUrl })
    .where(eq(snags.id, r.snag.id));
  refresh(r.snag.projectId);
  return { ok: "Marked fixed.", at: Date.now() };
}

/** Designers, admins and the owner sign off a fix; supervisors can't verify their own team's work. */
export async function verifySnag(form: FormData) {
  return setSnagStatus(form, "VERIFIED");
}
export async function reopenSnag(form: FormData) {
  return setSnagStatus(form, "OPEN");
}
export async function deleteSnag(form: FormData) {
  return setSnagStatus(form, "DELETE");
}

async function setSnagStatus(
  form: FormData,
  to: "VERIFIED" | "OPEN" | "DELETE",
) {
  const r = await load(String(form.get("id")));
  if (!r) return;
  if (
    to === "VERIFIED" &&
    r.user.role !== "SUPERVISOR" &&
    r.snag.status === "FIXED"
  ) {
    await db
      .update(snags)
      .set({ status: "VERIFIED", verifiedAt: new Date() })
      .where(eq(snags.id, r.snag.id));
  } else if (to === "OPEN") {
    await db
      .update(snags)
      .set({ status: "OPEN", fixedAt: null, verifiedAt: null })
      .where(eq(snags.id, r.snag.id));
  } else if (
    to === "DELETE" &&
    r.snag.status === "OPEN" &&
    (r.snag.createdById === r.user.id ||
      r.user.role === "OWNER" ||
      r.user.role === "ADMIN")
  ) {
    await db.delete(snags).where(eq(snags.id, r.snag.id));
  }
  refresh(r.snag.projectId);
}
