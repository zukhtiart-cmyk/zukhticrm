"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, designs, projects, quotes, snags } from "@/db";
import { gte } from "drizzle-orm";
import { saveFile } from "@/lib/storage";
import { loadPortalClient } from "@/lib/portal-data";

async function ownsProject(token: string, projectId: string) {
  const client = await loadPortalClient(token);
  const project = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.clientId, client.id)) });
  if (!project) throw new Error("Not found");
  return project;
}

export async function decideDesign(_: unknown, form: FormData) {
  const token = String(form.get("token"));
  const project = await ownsProject(token, String(form.get("projectId")));
  const decision = form.get("decision") === "approve" ? "APPROVED" : "CHANGES_REQUESTED";
  const comment = String(form.get("comment") ?? "").trim().slice(0, 1000);
  if (decision === "CHANGES_REQUESTED" && !comment) return { error: "Please tell us what you'd like changed." };
  const updated = await db
    .update(designs)
    .set({ status: decision, clientComment: comment || null, decidedAt: new Date() })
    .where(and(eq(designs.id, String(form.get("designId"))), eq(designs.projectId, project.id), eq(designs.status, "PENDING")))
    .returning({ id: designs.id });
  if (!updated.length) return { error: "This design was already answered or withdrawn." };
  revalidatePath(`/portal/${token}`);
  revalidatePath(`/projects/${project.id}`, "layout");
  return { ok: decision === "APPROVED" ? "Approved — thank you!" : "Thanks, your designer will send a revised version." };
}

export async function acceptQuote(form: FormData) {
  const token = String(form.get("token"));
  const project = await ownsProject(token, String(form.get("projectId")));
  await db
    .update(quotes)
    .set({ status: "ACCEPTED" })
    .where(and(eq(quotes.id, String(form.get("quoteId"))), eq(quotes.projectId, project.id), eq(quotes.status, "SENT")));
  revalidatePath(`/portal/${token}`);
  revalidatePath(`/projects/${project.id}`, "layout");
}

/** Client reports something to fix (after or close to handover). */
export async function reportSnag(_: unknown, form: FormData) {
  const token = String(form.get("token"));
  const project = await ownsProject(token, String(form.get("projectId")));
  const description = String(form.get("description") ?? "").trim().slice(0, 500);
  if (description.length < 3) return { error: "Please describe what needs fixing." };
  const recent = await db.select({ id: snags.id }).from(snags).where(and(eq(snags.projectId, project.id), eq(snags.fromClient, true), gte(snags.createdAt, new Date(Date.now() - 86400000))));
  if (recent.length >= 15) return { error: "That's a lot for one day — please message your project manager and we'll visit." };
  const photo = form.get("photo");
  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/") || photo.size > 15 * 1024 * 1024) return { error: "The photo must be an image under 15 MB." };
    photoUrl = await saveFile(photo, `photos/${project.id}`);
  }
  await db.insert(snags).values({ projectId: project.id, room: String(form.get("room") ?? "").trim().slice(0, 60) || "General", description, photoUrl, fromClient: true });
  revalidatePath(`/portal/${token}`);
  revalidatePath(`/projects/${project.id}`, "layout");
  revalidatePath("/desk/snags");
  return { ok: "Thanks — we've added it to your snag list and the team will schedule a fix." };
}
