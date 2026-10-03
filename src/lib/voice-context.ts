import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { db, milestones, orders, projects, stages, visits } from "@/db";
import { officeScope } from "./permissions";
import type { Role } from "@/db/schema";
import type { VoiceContext } from "./voice-ai";

export function officeTimeZone(currency: string) {
  return currency === "AED" ? "Asia/Dubai" : currency === "CNY" ? "Asia/Shanghai" : "Asia/Kolkata";
}

function localDay(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Loads a project the user may access, shaped as context for the AI. */
export async function buildVoiceContext(projectId: string, user: { name: string; role: Role; officeId: string | null }): Promise<{ ctx: VoiceContext; project: { id: string; officeCurrency: string } } | null> {
  const scope = officeScope(user);
  const project = await db.query.projects.findFirst({
    where: scope ? and(eq(projects.id, projectId), eq(projects.officeId, scope)) : eq(projects.id, projectId),
    with: {
      client: true,
      office: true,
      stages: { orderBy: asc(stages.order) },
      milestones: { orderBy: asc(milestones.sortOrder) },
      orders: { orderBy: asc(orders.item) },
      visits: { where: gte(visits.at, new Date(Date.now() - 86400000)), orderBy: asc(visits.at) },
    },
  });
  if (!project) return null;
  const tz = officeTimeZone(project.office.currency);
  const ctx: VoiceContext = {
    today: `${localDay(new Date(), tz)} (${new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: tz })})`,
    speaker: { name: user.name, role: user.role },
    project: {
      name: project.name,
      code: project.code,
      currency: project.office.currency,
      office: project.office.name,
      clientName: project.client.name,
      clientLanguage: project.client.language,
      progress: project.progress,
      expectedHandover: project.expectedHandover ? localDay(project.expectedHandover, tz) : null,
    },
    stages: project.stages.map((s) => ({ id: s.id, name: s.name, status: s.status, progress: s.progress })),
    milestones: project.milestones.map((m) => ({ id: m.id, label: m.label, amount: m.amount, status: m.status })),
    orders: project.orders.map((o) => ({ id: o.id, item: o.item, vendor: o.vendor, status: o.status, eta: o.eta ? localDay(o.eta, tz) : null })),
    visits: project.visits.map((v) => ({ id: v.id, title: v.title, at: v.at.toISOString() })),
  };
  return { ctx, project: { id: project.id, officeCurrency: project.office.currency } };
}
