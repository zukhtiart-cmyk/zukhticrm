"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clients, db, projects, snags, stages, warranties } from "@/db";
import { appBaseUrl, newPortalToken, portalPath } from "@/lib/portal";
import { formFile } from "@/lib/site-ops";
import { saveFile } from "@/lib/storage";
import { notifyClient } from "@/lib/wa-conversations";
import { assertProjectAccess } from "./data";

export type FormState = { error?: string; ok?: string; at?: number } | undefined;

const done = (id: string) => {
  revalidatePath(`/projects/${id}`, "layout");
  revalidatePath("/portal", "layout");
};

export async function addWarranty(_: FormState, form: FormData): Promise<FormState> {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "snags");
  const item = String(form.get("item") ?? "").trim();
  if (!item) return { error: "What is covered?" };
  const months = Math.max(1, Math.min(600, Math.round(Number(form.get("months")) || 12)));
  const start = String(form.get("startsOn") ?? "");
  const f = formFile(form, "doc");
  if (f.error) return { error: f.error };
  const docUrl = f.file ? await saveFile(f.file, `handover/${project.id}`) : null;
  await db.insert(warranties).values({
    projectId: project.id,
    item: item.slice(0, 160),
    brand: String(form.get("brand") ?? "").trim() || null,
    months,
    startsOn: start ? new Date(`${start}T12:00:00`) : (project.handedOverAt ?? null),
    docUrl,
    notes: String(form.get("notes") ?? "").trim() || null,
  });
  done(project.id);
  return { ok: "Warranty added.", at: Date.now() };
}

export async function deleteWarranty(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "snags");
  await db.delete(warranties).where(and(eq(warranties.id, String(form.get("id"))), eq(warranties.projectId, project.id)));
  done(project.id);
}

export async function saveCareNotes(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "snags");
  await db.update(projects).set({ careNotes: String(form.get("careNotes") ?? "").trim().slice(0, 8000) || null }).where(eq(projects.id, project.id));
  done(project.id);
}

/**
 * Marks the project handed over. Blocks while snags are open unless explicitly overridden.
 * Optionally sends the client their handover pack link on WhatsApp.
 */
export async function markHandedOver(_: FormState, form: FormData): Promise<FormState> {
  const { user, project } = await assertProjectAccess(String(form.get("projectId")), "projects.edit");
  if (project.status === "HANDED_OVER") return { error: "Already handed over." };
  const open = await db.select({ id: snags.id }).from(snags).where(and(eq(snags.projectId, project.id), ne(snags.status, "VERIFIED")));
  if (open.length && form.get("override") !== "on") return { error: `${open.length} snag${open.length > 1 ? "s are" : " is"} not verified yet. Fix them first, or tick "hand over anyway".` };
  const on = form.get("handedOverOn") ? new Date(`${form.get("handedOverOn")}T12:00:00`) : new Date();
  const amcMonths = Math.max(0, Math.min(60, Math.round(Number(form.get("amcMonths") ?? 12))));
  const amc = new Date(on);
  amc.setMonth(amc.getMonth() + amcMonths);
  await db
    .update(projects)
    .set({ status: "HANDED_OVER", handedOverAt: on, amcDueAt: amcMonths ? amc : null, amcRemindedAt: null, progress: 100 })
    .where(eq(projects.id, project.id));
  await db.update(stages).set({ status: "DONE", progress: 100 }).where(eq(stages.projectId, project.id));
  // Warranties without a start date start on handover day.
  const ws = await db.select().from(warranties).where(eq(warranties.projectId, project.id));
  for (const w of ws.filter((w) => !w.startsOn)) await db.update(warranties).set({ startsOn: on }).where(eq(warranties.id, w.id));

  let note = "";
  if (form.get("notify") === "on") {
    const client = await db.query.clients.findFirst({ where: eq(clients.id, project.clientId) });
    if (client) {
      let token = client.portalToken;
      if (!token) {
        token = newPortalToken();
        await db.update(clients).set({ portalToken: token }).where(eq(clients.id, client.id));
      }
      const base = await appBaseUrl();
      const text = `Congratulations on your new home! 🏡 ${project.name} is officially handed over.\n\nYour handover pack — warranties, care instructions and your snag list — is here:\n${base}${portalPath(token)}?p=${project.id}#handover\n\nIf anything needs attention, report it from the same page or reply here. — Team Zukhti`;
      const res = await notifyClient(client, text, [], base, user.id);
      note = ` Client message: ${res.note}.`;
    }
  }
  done(project.id);
  return { ok: `Marked handed over.${note}`, at: Date.now() };
}
