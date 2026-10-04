import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { dailyReports, db, leads, milestones, orders, projects, siteUpdates, users } from "@/db";
import { sendTemplate, sendText, templateConfigured, whatsappConfigured } from "./whatsapp";

const DAY = 86400000;

/** Today's date in India time (HQ), e.g. 2026-10-04. */
export function istDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export type DailyFacts = Awaited<ReturnType<typeof collectFacts>>;

export async function collectFacts(now = new Date()) {
  const since = new Date(now.getTime() - DAY);
  const updates = await db.query.siteUpdates.findMany({
    where: gte(siteUpdates.createdAt, since),
    with: { project: true, author: true, stage: true },
    orderBy: desc(siteUpdates.createdAt),
  });
  const paid = await db.query.milestones.findMany({ where: and(eq(milestones.status, "PAID"), gte(milestones.paidAt, since)), with: { project: { with: { office: true } } } });
  const shipped = await db.query.orders.findMany({ where: and(gte(orders.shippedAt, since)), with: { project: true } });
  const delivered = await db.query.orders.findMany({ where: and(gte(orders.deliveredAt, since)), with: { project: true } });
  const late = await db.query.orders.findMany({ where: and(ne(orders.status, "DELIVERED"), lte(orders.eta, now)), with: { project: true } });
  const newLeads = await db.select({ name: leads.name, source: leads.source }).from(leads).where(gte(leads.createdAt, since));
  const followUps = await db
    .select({ name: leads.name })
    .from(leads)
    .where(and(lte(leads.nextFollowUpAt, new Date(now.getTime() + DAY)), inArray(leads.status, ["NEW", "CONTACTED", "SITE_VISIT", "DESIGN", "QUOTED"])));
  const active = await db.query.projects.findMany({ where: eq(projects.status, "ACTIVE"), with: { updates: { orderBy: desc(siteUpdates.createdAt), limit: 1 } } });
  const silent = active.filter((p) => !p.updates[0] || p.updates[0].createdAt < since).map((p) => p.name);

  return {
    day: istDay(now),
    updates: updates.map((u) => ({ project: u.project.name, by: u.author.name, stage: u.stage?.name ?? null, summary: u.summary, issues: u.issues, sentToClient: u.sentToClient })),
    payments: paid.map((m) => ({ project: m.project.name, label: m.label, amount: m.paidAmount ?? m.amount, currency: m.project.office.currency })),
    shipped: [...new Set(shipped.map((o) => `${o.poNumber ?? o.item} (${o.project.name})${o.containerNo ? ` · ${o.containerNo}` : ""}`))],
    delivered: [...new Set(delivered.map((o) => `${o.poNumber ?? o.item} (${o.project.name})`))],
    lateOrders: [...new Set(late.map((o) => `${o.poNumber ?? o.item} (${o.project.name})`))],
    newLeads: newLeads.map((l) => `${l.name} — ${l.source}`),
    followUps: followUps.map((l) => l.name),
    silentProjects: silent,
  };
}

const money = (n: number, c: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

/** Plain summary used when no AI key is set, or as the AI's fallback. */
export function basicReport(f: DailyFacts) {
  const out: string[] = [`*Zukhti daily summary — ${f.day}*`];
  const issues = f.updates.filter((u) => u.issues);
  out.push(`\n*Site* — ${f.updates.length} update${f.updates.length === 1 ? "" : "s"} today`);
  const byProject = new Map<string, string[]>();
  for (const u of f.updates) byProject.set(u.project, [...(byProject.get(u.project) ?? []), `${u.summary}${u.stage ? ` [${u.stage}]` : ""}`]);
  for (const [p, list] of byProject) out.push(`• ${p}: ${list.slice(0, 2).join("; ")}`);
  if (issues.length) out.push(`\n*Issues*\n${issues.map((u) => `• ${u.project}: ${u.issues}`).join("\n")}`);
  if (f.silentProjects.length) out.push(`\n*No update today*: ${f.silentProjects.join(", ")}`);
  if (f.payments.length) out.push(`\n*Payments received*\n${f.payments.map((p) => `• ${p.project} — ${p.label}: ${money(p.amount, p.currency)}`).join("\n")}`);
  if (f.shipped.length || f.delivered.length || f.lateOrders.length) {
    out.push("\n*Procurement*");
    if (f.shipped.length) out.push(`• Shipped: ${f.shipped.join(", ")}`);
    if (f.delivered.length) out.push(`• Delivered: ${f.delivered.join(", ")}`);
    if (f.lateOrders.length) out.push(`• Past ETA: ${f.lateOrders.join(", ")}`);
  }
  if (f.newLeads.length || f.followUps.length) {
    out.push("\n*Sales*");
    if (f.newLeads.length) out.push(`• New leads: ${f.newLeads.join(", ")}`);
    if (f.followUps.length) out.push(`• Follow-ups due: ${f.followUps.join(", ")}`);
  }
  return out.join("\n");
}

async function aiReport(f: DailyFacts) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 1200,
    system:
      "You write the evening operations summary for the owner of Zukhti Home, a turnkey interior design firm. Use only the JSON facts given. WhatsApp formatting (*bold*, • bullets), under 220 words. Order: one-line headline, what moved on site per project, issues needing a decision, money in, procurement, sales. Skip empty sections. No invented numbers, no pleasantries.",
    messages: [{ role: "user", content: JSON.stringify(f) }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text) throw new Error("empty");
  return text.startsWith("*Zukhti") ? text : `*Zukhti daily summary — ${f.day}*\n${text}`;
}

/** Builds (or rebuilds) today's report and stores it. */
export async function buildDailyReport(now = new Date()) {
  const facts = await collectFacts(now);
  let body = basicReport(facts);
  let ai = false;
  if (process.env.ANTHROPIC_API_KEY && (facts.updates.length || facts.payments.length || facts.newLeads.length)) {
    try {
      body = await aiReport(facts);
      ai = true;
    } catch {
      /* keep the rule-based version */
    }
  }
  await db.insert(dailyReports).values({ day: facts.day, body }).onConflictDoUpdate({ target: dailyReports.day, set: { body, createdAt: new Date() } });
  return { day: facts.day, body, ai };
}

/** Sends the report to owners/admins who have a phone number. */
export async function sendDailyReport(body: string) {
  const people = await db.select({ name: users.name, phone: users.phone }).from(users).where(and(eq(users.active, true), inArray(users.role, ["OWNER", "ADMIN"])));
  const results: { name: string; note: string }[] = [];
  for (const p of people) {
    if (!p.phone) {
      results.push({ name: p.name, note: "no phone on profile" });
      continue;
    }
    if (!whatsappConfigured()) {
      results.push({ name: p.name, note: "WhatsApp not connected" });
      continue;
    }
    try {
      // Templates work any time; plain text only reaches people who messaged the business in the last 24h.
      if (templateConfigured()) await sendTemplate(p.phone, p.name.split(" ")[0], body);
      else await sendText(p.phone, body);
      results.push({ name: p.name, note: "sent" });
    } catch (e) {
      results.push({ name: p.name, note: `failed: ${(e as Error).message}`.slice(0, 160) });
    }
  }
  return results;
}
