"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clients, db, designs } from "@/db";
import { saveFile } from "@/lib/storage";
import { newPortalToken } from "@/lib/portal";
import { assertProjectAccess } from "./data";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const done = (id: string) => revalidatePath(`/projects/${id}`, "layout");

export async function uploadDesign(_: unknown, form: FormData) {
  const { user, project } = await assertProjectAccess(String(form.get("projectId")), "design");
  const file = form.get("file");
  const room = String(form.get("room") ?? "").trim() || "General";
  const title = String(form.get("title") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a render or PDF to upload." };
  if (!ALLOWED.includes(file.type)) return { error: "Upload a JPG, PNG, WebP image or a PDF." };
  if (file.size > 20 * 1024 * 1024) return { error: "File is too large (max 20 MB)." };
  if (!title) return { error: "Give the design a title, e.g. 'Living room 3D view'." };

  const prev = await db.query.designs.findFirst({
    where: and(eq(designs.projectId, project.id), eq(designs.room, room), eq(designs.title, title)),
    orderBy: desc(designs.version),
  });
  const fileUrl = await saveFile(file, `designs/${project.id}`);
  await db.insert(designs).values({
    projectId: project.id,
    room,
    title,
    version: (prev?.version ?? 0) + 1,
    fileUrl,
    fileType: file.type === "application/pdf" ? "pdf" : "image",
    notes: String(form.get("notes") ?? "").trim() || null,
    status: form.get("share") === "on" ? "PENDING" : "DRAFT",
    sharedAt: form.get("share") === "on" ? new Date() : null,
    uploadedById: user.id,
  });
  done(project.id);
  return { ok: prev ? `Uploaded as version ${prev.version + 1}.` : "Uploaded." };
}

export async function shareDesign(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "design");
  await db
    .update(designs)
    .set({ status: "PENDING", sharedAt: new Date(), clientComment: null, decidedAt: null })
    .where(and(eq(designs.id, String(form.get("id"))), eq(designs.projectId, project.id), eq(designs.status, "DRAFT")));
  done(project.id);
}

export async function unshareDesign(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "design");
  await db
    .update(designs)
    .set({ status: "DRAFT", sharedAt: null })
    .where(and(eq(designs.id, String(form.get("id"))), eq(designs.projectId, project.id), eq(designs.status, "PENDING")));
  done(project.id);
}

export async function deleteDesign(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "design");
  await db.delete(designs).where(and(eq(designs.id, String(form.get("id"))), eq(designs.projectId, project.id), eq(designs.status, "DRAFT")));
  done(project.id);
}

// ---------- Client portal link ----------

export async function enablePortal(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "projects.edit");
  await db.update(clients).set({ portalToken: newPortalToken() }).where(eq(clients.id, project.clientId));
  done(project.id);
}

export async function disablePortal(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "projects.edit");
  await db.update(clients).set({ portalToken: null }).where(eq(clients.id, project.clientId));
  done(project.id);
}
