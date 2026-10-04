import "server-only";
import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { db, leads, milestones, projects, quotes, siteUpdates, stages } from "@/db";
import { convert } from "./fx";
import { projectMargin } from "./margin";
import { projectCosts } from "./site-costs";
import { getSettings } from "./settings";

const DAY = 86400000;

/** Owner dashboard numbers. Totals are shown in INR-equivalent using the Rates page exchange rates. */
export async function dashboardData(officeId?: string) {
  const { fxRates } = await getSettings();
  const toInr = (amount: number, currency: string) => {
    try {
      return convert(fxRates, amount, currency, "INR");
    } catch {
      return 0;
    }
  };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const officeFilter = officeId ? eq(projects.officeId, officeId) : undefined;

  const live = await db.query.projects.findMany({
    where: and(officeFilter, ne(projects.status, "HANDED_OVER")),
    with: {
      client: true,
      office: true,
      manager: true,
      stages: { orderBy: asc(stages.order) },
      milestones: { with: { dueStage: true } },
      updates: { orderBy: desc(siteUpdates.createdAt), limit: 1 },
      orders: true,
      boqItems: true,
      quotes: { orderBy: desc(quotes.version), limit: 1 },
    },
    orderBy: asc(projects.expectedHandover),
  });

  type Row = {
    id: string; name: string; client: string; office: string; officeId: string; status: string; currency: string; progress: number;
    currentStage: string; handover: Date | null; handoverLate: boolean; contract: number; collected: number; outstanding: number; dueNow: number;
    marginPct: number; estimatedPct: number; slipping: string[]; lastUpdate: Date | null; stale: boolean; lateOrders: number; issue: string | null; budget: number; committed: number; costUsedPct: number; overrun: boolean;
  };
  const rows: Row[] = [];
  for (const p of live) {
    const cur = p.office.currency;
    const [m, costs] = await Promise.all([projectMargin(p.id), projectCosts(p.id)]);
    const contract = m.sell * (1 + p.office.taxRate / 100);
    const collected = p.milestones.filter((x) => x.status === "PAID").reduce((a, x) => a + (x.paidAmount ?? x.amount), 0);
    const dueNow = p.milestones
      .filter((x) => x.status !== "PAID" && (!x.dueStage || x.dueStage.status !== "NOT_STARTED"))
      .reduce((a, x) => a + x.amount, 0);
    const current = p.stages.find((s) => s.status !== "DONE");
    const slipping = p.stages.filter((s) => s.status !== "DONE" && s.plannedEnd && s.plannedEnd < now);
    const lastUpdate = p.updates[0]?.createdAt ?? null;
    const lateOrders = p.orders.filter((o) => o.status !== "DELIVERED" && o.eta && o.eta < now);
    rows.push({
      id: p.id,
      name: p.name,
      client: p.client.name,
      office: p.office.name,
      officeId: p.officeId,
      status: p.status,
      currency: cur,
      progress: p.progress,
      currentStage: current?.name ?? "Complete",
      handover: p.expectedHandover,
      handoverLate: !!p.expectedHandover && p.expectedHandover < now,
      contract,
      collected,
      outstanding: Math.max(0, contract - collected),
      dueNow,
      marginPct: m.marginPct,
      estimatedPct: m.estimatedPct,
      slipping: slipping.map((s) => s.name),
      lastUpdate,
      stale: p.status === "ACTIVE" && (!lastUpdate || now.getTime() - lastUpdate.getTime() > 7 * DAY),
      lateOrders: lateOrders.length,
      issue: p.updates[0]?.issues ?? null,
      budget: costs.budget,
      committed: costs.committed,
      costUsedPct: costs.usedPct,
      overrun: costs.overrun,
    });
  }

  const paidThisMonth = await db.query.milestones.findMany({
    where: and(eq(milestones.status, "PAID"), gte(milestones.paidAt, monthStart)),
    with: { project: { with: { office: true } } },
  });
  const collectedMonth = paidThisMonth
    .filter((x) => !officeId || x.project.officeId === officeId)
    .reduce((a, x) => a + toInr(x.paidAmount ?? x.amount, x.project.office.currency), 0);

  const openStatuses = ["NEW", "CONTACTED", "SITE_VISIT", "DESIGN", "QUOTED"] as const;
  const leadRows = await db.select({ status: leads.status, officeId: leads.officeId, updatedAt: leads.updatedAt }).from(leads);
  const scopedLeads = leadRows.filter((l) => !officeId || l.officeId === officeId);
  const pipeline = [...openStatuses, "WON" as const].map((s) => ({ status: s, count: scopedLeads.filter((l) => l.status === s).length }));
  const wonLast30 = scopedLeads.filter((l) => l.status === "WON" && l.updatedAt > new Date(now.getTime() - 30 * DAY)).length;

  // Quotes sent but not accepted, on projects still in design.
  const sentQuotes = live.filter((p) => p.quotes[0]?.status === "SENT").reduce((a, p) => a + toInr(p.quotes[0].total, p.quotes[0].currency), 0);

  const totals = {
    activeProjects: rows.filter((r) => r.status === "ACTIVE").length,
    inDesign: rows.filter((r) => r.status === "DESIGN").length,
    contractInr: rows.reduce((a, r) => a + toInr(r.contract, r.currency), 0),
    outstandingInr: rows.reduce((a, r) => a + toInr(r.outstanding, r.currency), 0),
    dueNowInr: rows.reduce((a, r) => a + toInr(r.dueNow, r.currency), 0),
    collectedMonthInr: collectedMonth,
    sentQuotesInr: sentQuotes,
    openLeads: scopedLeads.filter((l) => (openStatuses as readonly string[]).includes(l.status)).length,
    wonLast30,
    avgMargin: rows.filter((r) => r.contract > 0).length ? Math.round((rows.filter((r) => r.contract > 0).reduce((a, r) => a + r.marginPct, 0) / rows.filter((r) => r.contract > 0).length) * 10) / 10 : 0,
    lateOrders: rows.reduce((a, r) => a + r.lateOrders, 0),
  };

  const offices = [...new Map(live.map((p) => [p.officeId, p.office])).values()].map((o) => {
    const mine = rows.filter((r) => r.officeId === o.id);
    return { id: o.id, name: o.name, currency: o.currency, projects: mine.length, contract: mine.reduce((a, r) => a + r.contract, 0), collected: mine.reduce((a, r) => a + r.collected, 0) };
  });

  const attention = [
    ...rows.filter((r) => r.handoverLate).map((r) => ({ projectId: r.id, project: r.name, text: "Handover date has passed", tone: "clay" as const })),
    ...rows.filter((r) => r.slipping.length).map((r) => ({ projectId: r.id, project: r.name, text: `Behind plan: ${r.slipping.join(", ")}`, tone: "clay" as const })),
    ...rows.filter((r) => r.stale).map((r) => ({ projectId: r.id, project: r.name, text: r.lastUpdate ? "No site update for over a week" : "No site updates yet", tone: "brass" as const })),
    ...rows.filter((r) => r.lateOrders).map((r) => ({ projectId: r.id, project: r.name, text: `${r.lateOrders} order${r.lateOrders > 1 ? "s" : ""} past ETA`, tone: "brass" as const })),
    ...rows.filter((r) => r.overrun).map((r) => ({ projectId: r.id, project: r.name, text: `Costs over budget (${r.costUsedPct}% of BOQ cost committed)`, tone: "clay" as const })),
    ...rows
      .filter((r) => !r.overrun && r.status === "ACTIVE" && r.budget > 0 && r.costUsedPct > r.progress + 25)
      .map((r) => ({ projectId: r.id, project: r.name, text: `Spending ${r.costUsedPct}% of budget at ${r.progress}% progress`, tone: "brass" as const })),
    ...rows.filter((r) => r.contract > 0 && r.marginPct < 20).map((r) => ({ projectId: r.id, project: r.name, text: `Low margin: ${r.marginPct}%`, tone: "clay" as const })),
  ];

  return { rows, totals, pipeline, offices, attention, fxAsOf: fxRates.asOf };
}
