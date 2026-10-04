"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clients, conversations, db, leadActivities, leads, leadStatusEnum, projects } from "@/db";
import { draftFollowUp } from "@/lib/lead-followup";
import { deliver, getConversation } from "@/lib/wa-conversations";
import { appBaseUrl } from "@/lib/portal";
import { officeScope, requireUser } from "@/lib/auth";
import { createProjectWithDefaults } from "@/lib/projects";

const optional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional();

const leadSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().min(6, "Phone is required"),
  email: optional,
  source: z.string().trim().min(1),
  city: optional,
  budgetBand: optional,
  propertyType: optional,
  officeId: z.string().min(1),
  ownerId: optional,
  notes: optional,
  nextFollowUpAt: optional,
});

function toDate(v: string | null | undefined) {
  return v ? new Date(`${v}T10:00:00`) : null;
}

async function loadLead(id: string) {
  const user = await requireUser("leads");
  const scope = officeScope(user);
  const lead = await db.query.leads.findFirst({ where: scope ? and(eq(leads.id, id), eq(leads.officeId, scope)) : eq(leads.id, id) });
  if (!lead) throw new Error("Lead not found");
  return { user, lead };
}

export async function createLead(_: unknown, form: FormData) {
  const user = await requireUser("leads");
  const parsed = leadSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const scope = officeScope(user);
  const data = parsed.data;
  const [lead] = await db
    .insert(leads)
    .values({ ...data, officeId: scope ?? data.officeId, ownerId: data.ownerId ?? user.id, nextFollowUpAt: toDate(data.nextFollowUpAt) })
    .returning();
  redirect(`/leads/${lead.id}`);
}

export async function updateLead(_: unknown, form: FormData) {
  const { user, lead } = await loadLead(String(form.get("id")));
  const parsed = leadSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const scope = officeScope(user);
  const data = parsed.data;
  await db
    .update(leads)
    .set({ ...data, officeId: scope ?? data.officeId, ownerId: data.ownerId ?? lead.ownerId ?? user.id, nextFollowUpAt: toDate(data.nextFollowUpAt) })
    .where(eq(leads.id, lead.id));
  revalidatePath(`/leads/${form.get("id")}`);
  return { ok: "Saved" };
}

export async function setLeadStatus(form: FormData) {
  const { lead } = await loadLead(String(form.get("id")));
  const status = z.enum(leadStatusEnum.enumValues).parse(form.get("status"));
  await db.update(leads).set({ status }).where(eq(leads.id, lead.id));
  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
}

export async function logActivity(form: FormData) {
  const { user, lead } = await loadLead(String(form.get("id")));
  const summary = String(form.get("summary") ?? "").trim();
  const type = String(form.get("type") ?? "NOTE");
  const next = String(form.get("nextFollowUpAt") ?? "");
  if (summary) await db.insert(leadActivities).values({ leadId: lead.id, type, summary, userId: user.id });
  await db
    .update(leads)
    .set({ nextFollowUpAt: next ? toDate(next) : null, status: lead.status === "NEW" && summary ? "CONTACTED" : lead.status })
    .where(eq(leads.id, lead.id));
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/");
}

/** Won lead → client + project with standard stages and payment schedule. */
export async function convertLead(form: FormData) {
  const { user, lead } = await loadLead(String(form.get("id")));
  const projectName = String(form.get("projectName") ?? "").trim() || `${lead.name} residence`;
  const siteAddress = String(form.get("siteAddress") ?? "").trim() || null;
  if (lead.clientId) {
    const existing = await db.query.projects.findFirst({ where: eq(projects.clientId, lead.clientId) });
    if (existing) redirect(`/projects/${existing.id}`);
  }
  const project = await db.transaction(async (tx) => {
    const [client] = await tx.insert(clients).values({ name: lead.name, phone: lead.phone, email: lead.email, officeId: lead.officeId }).returning();
    await tx.update(leads).set({ status: "WON", clientId: client.id, nextFollowUpAt: null }).where(eq(leads.id, lead.id));
    await tx.insert(leadActivities).values({ leadId: lead.id, type: "NOTE", summary: `Converted to client; project "${projectName}" created`, userId: user.id });
    return createProjectWithDefaults(tx, { name: projectName, clientId: client.id, officeId: lead.officeId, siteAddress, managerId: lead.ownerId ?? user.id });
  });
  redirect(`/projects/${project.id}`);
}

// ---------- Follow-up drafts ----------

export async function draftLeadFollowUp(id: string) {
  const { user, lead } = await loadLead(id);
  const activities = await db.query.leadActivities.findMany({ where: eq(leadActivities.leadId, lead.id), orderBy: desc(leadActivities.at), limit: 6 });
  return draftFollowUp(lead, activities, user.name);
}

export async function sendLeadFollowUp(id: string, text: string, nextFollowUp: string | null) {
  const { user, lead } = await loadLead(id);
  const body = text.trim().slice(0, 2000);
  if (!body) return { error: "Write a message first." };
  const conv = await getConversation(lead.phone, lead.name);
  if (!conv.leadId && !conv.clientId) await db.update(conversations).set({ leadId: lead.id }).where(eq(conversations.id, conv.id));
  const res = await deliver(conv, body, { appUrl: await appBaseUrl(), intent: "follow-up", authorId: user.id, firstName: lead.name.split(" ")[0] });
  await db.insert(leadActivities).values({ leadId: lead.id, type: "WHATSAPP", summary: `Follow-up (${res.note}): ${body}`, userId: user.id });
  await db
    .update(leads)
    .set({ nextFollowUpAt: toDate(nextFollowUp), ...(lead.status === "NEW" ? { status: "CONTACTED" as const } : {}) })
    .where(eq(leads.id, lead.id));
  revalidatePath(`/leads/${lead.id}`);
  return { status: res.status, note: res.note };
}

export async function logManualFollowUp(id: string, text: string, nextFollowUp: string | null) {
  const { user, lead } = await loadLead(id);
  await db.insert(leadActivities).values({ leadId: lead.id, type: "WHATSAPP", summary: `Follow-up sent from phone: ${text.trim().slice(0, 2000)}`, userId: user.id });
  await db
    .update(leads)
    .set({ nextFollowUpAt: toDate(nextFollowUp), ...(lead.status === "NEW" ? { status: "CONTACTED" as const } : {}) })
    .where(eq(leads.id, lead.id));
  revalidatePath(`/leads/${lead.id}`);
}
