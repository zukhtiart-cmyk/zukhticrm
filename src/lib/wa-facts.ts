import "server-only";
import { and, asc, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db, designs, milestones, orders, photos, projects, siteUpdates, stages, visits } from "@/db";

const ORDER_LABEL: Record<string, string> = {
  ORDERED: "ordered",
  IN_PRODUCTION: "being made",
  SHIPPED: "on the way",
  CUSTOMS: "clearing customs",
  DELIVERED: "delivered",
};

function day(d: Date | null | undefined, tz: string) {
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz }) : null;
}

function tzFor(currency: string) {
  return currency === "AED" ? "Asia/Dubai" : currency === "CNY" ? "Asia/Shanghai" : "Asia/Kolkata";
}

/**
 * Everything the WhatsApp assistant may tell a client about one project.
 * Client-safe only: no costs, margins, vendors, internal notes or issues.
 */
export async function projectFacts(projectId: string, appUrl: string) {
  const p = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      client: true,
      office: true,
      manager: { columns: { name: true, phone: true } },
      stages: { orderBy: asc(stages.order) },
      milestones: { orderBy: asc(milestones.sortOrder), with: { dueStage: true } },
      orders: { orderBy: desc(orders.updatedAt) },
      visits: { where: gte(visits.at, new Date(Date.now() - 3 * 3600 * 1000)), orderBy: asc(visits.at) },
      designs: { where: eq(designs.status, "PENDING"), orderBy: asc(designs.room) },
      updates: {
        where: isNotNull(siteUpdates.clientMessage),
        orderBy: desc(siteUpdates.createdAt),
        limit: 3,
        with: { photos: { where: eq(photos.clientVisible, true) } },
      },
    },
  });
  if (!p) return null;
  const tz = tzFor(p.office.currency);
  const current = p.stages.find((s) => s.status !== "DONE");
  const next = current ? p.stages.find((s) => s.order > current.order) : undefined;
  const paid = p.milestones.filter((m) => m.status === "PAID").reduce((a, m) => a + (m.paidAmount ?? m.amount), 0);
  const nextPayment = p.milestones.find((m) => m.status !== "PAID");
  const latestPhotos = (
    await db
      .select({ url: photos.url })
      .from(photos)
      .where(and(eq(photos.projectId, p.id), eq(photos.clientVisible, true)))
      .orderBy(desc(photos.createdAt))
      .limit(3)
  ).map((r) => r.url);
  const fmt = (n: number) => `${p.office.currency} ${Math.round(n).toLocaleString(p.office.currency === "INR" ? "en-IN" : "en-US")}`;

  return {
    projectId: p.id,
    projectName: p.name,
    clientName: p.client.name,
    clientFirstName: p.client.name.split(" ")[0],
    clientLanguage: p.client.language,
    overallProgress: p.progress,
    currentStage: current ? { name: current.name, progress: current.progress, stageNumber: current.order, totalStages: p.stages.length } : null,
    nextStage: next?.name ?? null,
    stagesDone: p.stages.filter((s) => s.status === "DONE").map((s) => s.name),
    expectedHandover: day(p.expectedHandover, tz),
    recentUpdates: p.updates.map((u) => ({ date: day(u.createdAt, tz), message: u.clientMessage })),
    photoCount: latestPhotos.length,
    latestPhotoUrls: latestPhotos,
    payments: {
      paidSoFar: fmt(paid),
      next: nextPayment ? { label: nextPayment.label, amount: fmt(nextPayment.amount), dueAt: nextPayment.dueStage ? `${nextPayment.dueStage.name} stage` : "booking", invoiced: !!nextPayment.invoiceNumber } : null,
    },
    deliveries: p.orders.map((o) => ({ item: o.item, status: ORDER_LABEL[o.status] ?? o.status.toLowerCase(), expected: o.status === "DELIVERED" ? null : day(o.eta, tz) })),
    upcomingVisits: p.visits.map((v) => ({ title: v.title, when: v.at.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz }) })),
    designsAwaitingApproval: p.designs.map((d) => `${d.room}: ${d.title}`),
    portalLink: p.client.portalToken ? `${appUrl}/portal/${p.client.portalToken}` : null,
    projectManager: p.manager?.name ?? null,
  };
}

export type ProjectFacts = NonNullable<Awaited<ReturnType<typeof projectFacts>>>;

/** Plain status message used by the weekly summary and the rule-based fallback. */
export function statusMessage(f: ProjectFacts) {
  const lines = [`Hi ${f.clientFirstName} 👋 Here's your *${f.projectName}* update:`];
  if (f.currentStage) lines.push(`*Stage:* ${f.currentStage.name} (${f.currentStage.stageNumber} of ${f.currentStage.totalStages}) — ${f.overallProgress}% overall`);
  else lines.push(`*All stages complete* — ${f.overallProgress}%`);
  if (f.recentUpdates[0]?.message) lines.push(`*Latest:* ${f.recentUpdates[0].message.split("\n")[0].slice(0, 220)}`);
  if (f.nextStage) lines.push(`*Next:* ${f.nextStage}`);
  const moving = f.deliveries.filter((d) => d.status !== "delivered");
  if (moving.length) lines.push(`*Your items:* ${moving.map((d) => `${d.item} ${d.status}${d.expected ? `, around ${d.expected}` : ""}`).join("; ")}`);
  if (f.upcomingVisits[0]) lines.push(`*Next visit:* ${f.upcomingVisits[0].title}, ${f.upcomingVisits[0].when}`);
  if (f.payments.next) lines.push(`*Next payment:* ${f.payments.next.amount} (${f.payments.next.label}, due at ${f.payments.next.dueAt})`);
  if (f.expectedHandover) lines.push(`*Expected handover:* ${f.expectedHandover}`);
  if (f.portalLink) lines.push(`Photos & details: ${f.portalLink}`);
  lines.push(`Reply *PHOTOS* for the latest site pictures, or *TALK* to reach your project manager.`);
  return lines.join("\n");
}
