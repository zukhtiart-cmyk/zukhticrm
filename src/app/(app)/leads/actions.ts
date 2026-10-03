"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clients, db, leadActivities, leads, leadStatusEnum, projects } from "@/db";
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
