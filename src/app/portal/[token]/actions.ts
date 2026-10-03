"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, designs, projects, quotes } from "@/db";
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
