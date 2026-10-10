import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import {
  contractorBills,
  contractorPayments,
  db,
  leads,
  milestones,
  orders,
  siteExpenses,
  siteUpdates,
  snags,
  stages,
  workOrders,
} from "@/db";
import type { Role } from "@/db/schema";
import { can, officeScope } from "./permissions";
import { contractorLedger } from "./payouts";
import { projectCosts } from "./site-costs";
import { findContractor, scopedProject, scopedProjects } from "./site-ops";
import type { AssistantContext } from "./assistant-types";

/**
 * What Zuki can look up to answer questions. Every lookup is limited to the person's office
 * and role — money only for roles that handle money, contractor balances only for owner/accounts.
 */
type U = { id: string; name: string; role: Role; officeId: string | null };
const DAY = 86400000;
const fmt = (n: number, c: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
const seesMoney = (u: U) =>
  can(u.role, "payments") || can(u.role, "boq") || can(u.role, "admin");
const noAccess = (what: string) => ({ error: `Your role can't see ${what}.` });

async function liveProjectIds(u: U) {
  return (await scopedProjects(u)).map((p) => p.id);
}

export async function projectStatus(u: U, projectId: string) {
  const p = await scopedProject(u, projectId);
  if (!p) return { error: "Project not found" };
  const [st, last, open, ms] = await Promise.all([
    db
      .select()
      .from(stages)
      .where(eq(stages.projectId, p.id))
      .orderBy(asc(stages.order)),
    db.query.siteUpdates.findFirst({
      where: eq(siteUpdates.projectId, p.id),
      orderBy: desc(siteUpdates.createdAt),
      with: { author: true },
    }),
    db
      .select({ id: snags.id })
      .from(snags)
      .where(and(eq(snags.projectId, p.id), ne(snags.status, "VERIFIED"))),
    db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, p.id))
      .orderBy(asc(milestones.sortOrder)),
  ]);
  const now = Date.now();
  const current = st.find((s) => s.status !== "DONE");
  const out: Record<string, unknown> = {
    project: p.name,
    client: p.client.name,
    status: p.status,
    progress: `${p.progress}%`,
    currentStage: current
      ? `${current.name} (${current.progress}%)`
      : "All stages done",
    behindPlan: st
      .filter(
        (s) =>
          s.status !== "DONE" && s.plannedEnd && s.plannedEnd.getTime() < now,
      )
      .map((s) => s.name),
    expectedHandover: p.expectedHandover?.toISOString().slice(0, 10) ?? null,
    lastSiteUpdate: last
      ? {
          on: last.createdAt.toISOString().slice(0, 10),
          by: last.author.name,
          summary: last.summary,
          issues: last.issues,
        }
      : "none yet",
    openSnags: open.length,
  };
  if (seesMoney(u)) {
    const cur = p.office.currency;
    const paid = ms
      .filter((m) => m.status === "PAID")
      .reduce((a, m) => a + (m.paidAmount ?? m.amount), 0);
    const total = ms.reduce((a, m) => a + m.amount, 0);
    const next = ms.find((m) => m.status !== "PAID");
    out.money = {
      contract: fmt(total, cur),
      received: fmt(paid, cur),
      pending: fmt(total - paid, cur),
      nextMilestone: next
        ? `${next.label} — ${fmt(next.amount, cur)} (${next.status.toLowerCase()})`
        : "all paid",
    };
    const c = await projectCosts(p.id);
    out.costs = {
      budget: fmt(c.budget, cur),
      committed: fmt(c.committed, cur),
      usedOfBudget: `${c.usedPct}%`,
      overBudget: c.overrun,
    };
  }
  return out;
}

export async function contractorBalance(u: U, contractorId: string) {
  if (!can(u.role, "payouts")) return noAccess("contractor balances");
  const c = await findContractor(u, contractorId);
  if (!c) return { error: "Contractor not found" };
  const l = await contractorLedger(
    c.id,
    new Set((await scopedProjects(u, true)).map((p) => p.id)),
  );
  return {
    contractor: c.name,
    trade: c.trade,
    balance:
      l.balance > 0
        ? `${fmt(l.balance, l.currency)} due to them`
        : l.balance < 0
          ? `${fmt(-l.balance, l.currency)} advance with them`
          : "settled",
    approvedBills: fmt(l.billed, l.currency),
    totalPaid: fmt(l.totalPaid, l.currency),
    lastPayments: l.lines
      .filter((x) => x.kind === "PAYMENT")
      .slice(0, 3)
      .map(
        (x) =>
          `${x.at.toISOString().slice(0, 10)}: ${fmt(x.paid, x.currency)} (${x.label}${x.mode ? `, ${x.mode}` : ""})`,
      ),
  };
}

export async function collectionsDue(u: U, projectId?: string) {
  if (!can(u.role, "payments") && !can(u.role, "admin"))
    return noAccess("client payments");
  const ps = await scopedProjects(u);
  const ids = projectId
    ? ps.filter((p) => p.id === projectId).map((p) => p.id)
    : ps.map((p) => p.id);
  if (!ids.length) return { dueNow: [], note: "No live projects." };
  const rows = await db.query.milestones.findMany({
    where: and(
      inArray(milestones.projectId, ids),
      ne(milestones.status, "PAID"),
    ),
    with: { project: { with: { office: true } }, dueStage: true },
    orderBy: asc(milestones.sortOrder),
  });
  const due = rows.filter(
    (m) => !m.dueStage || m.dueStage.status !== "NOT_STARTED",
  );
  return {
    dueNow: due.map(
      (m) =>
        `${m.project.name}: ${m.label} — ${fmt(m.amount, m.project.office.currency)}${m.status === "INVOICED" ? " (invoiced)" : ""}`,
    ),
    laterInSchedule: rows.length - due.length,
  };
}

export async function approvalsPending(u: U) {
  if (!can(u.role, "approve")) return noAccess("approvals");
  const ids = (await scopedProjects(u, true)).map((p) => p.id);
  if (!ids.length) return { expenses: [], bills: [] };
  const [exp, bills] = await Promise.all([
    db.query.siteExpenses.findMany({
      where: and(
        inArray(siteExpenses.projectId, ids),
        eq(siteExpenses.status, "PENDING"),
      ),
      with: { project: true, submittedBy: true },
    }),
    db
      .select({
        amount: contractorBills.amount,
        note: contractorBills.note,
        wo: workOrders.number,
        currency: workOrders.currency,
        projectId: workOrders.projectId,
        status: contractorBills.status,
      })
      .from(contractorBills)
      .innerJoin(workOrders, eq(workOrders.id, contractorBills.workOrderId))
      .where(
        and(
          inArray(workOrders.projectId, ids),
          inArray(contractorBills.status, ["PENDING", "APPROVED"]),
        ),
      ),
  ]);
  return {
    expensesToApprove: exp.map(
      (e) =>
        `${fmt(e.amount, e.currency)} ${e.description} (${e.project.name}, by ${e.submittedBy.name})`,
    ),
    billsToApprove: bills
      .filter((b) => b.status === "PENDING")
      .map(
        (b) =>
          `${b.wo}: ${fmt(b.amount, b.currency)}${b.note ? ` — ${b.note}` : ""}`,
      ),
    billsApprovedNotPaid: bills
      .filter((b) => b.status === "APPROVED")
      .map((b) => `${b.wo}: ${fmt(b.amount, b.currency)}`),
  };
}

export async function openSnags(u: U, projectId?: string) {
  const ps = await scopedProjects(u, true);
  const ids = projectId
    ? ps.filter((p) => p.id === projectId).map((p) => p.id)
    : ps.map((p) => p.id);
  if (!ids.length) return { snags: [] };
  const rows = await db.query.snags.findMany({
    where: and(inArray(snags.projectId, ids), ne(snags.status, "VERIFIED")),
    with: { project: true },
    orderBy: asc(snags.createdAt),
    limit: 40,
  });
  return {
    count: rows.length,
    snags: rows.map(
      (s) =>
        `${s.project.name} · ${s.room}: ${s.description} (${s.status === "FIXED" ? "fixed, to verify" : "open"}${s.fromClient ? ", reported by client" : ""})`,
    ),
  };
}

export async function sitesWithoutUpdate(u: U, days = 1) {
  const ps = (await scopedProjects(u)).filter((p) => p.status === "ACTIVE");
  const since = new Date(Date.now() - days * DAY);
  const out: string[] = [];
  for (const p of ps) {
    const last = await db.query.siteUpdates.findFirst({
      where: eq(siteUpdates.projectId, p.id),
      orderBy: desc(siteUpdates.createdAt),
    });
    if (!last || last.createdAt < since)
      out.push(
        `${p.name} (last update: ${last ? last.createdAt.toISOString().slice(0, 10) : "never"})`,
      );
  }
  return { activeSites: ps.length, withoutUpdate: out };
}

export async function moneySummary(
  u: U,
  period: "today" | "week" | "month" = "week",
) {
  if (!can(u.role, "admin") && !can(u.role, "payouts"))
    return noAccess("the money summary");
  const now = new Date();
  const since =
    period === "today"
      ? new Date(now.toISOString().slice(0, 10))
      : period === "week"
        ? new Date(now.getTime() - 7 * DAY)
        : new Date(now.getFullYear(), now.getMonth(), 1);
  const ids = (await scopedProjects(u, true)).map((p) => p.id);
  if (!ids.length) return { period };
  const [inn, out, exp] = await Promise.all([
    db.query.milestones.findMany({
      where: and(
        inArray(milestones.projectId, ids),
        eq(milestones.status, "PAID"),
        gte(milestones.paidAt, since),
      ),
      with: { project: { with: { office: true } } },
    }),
    db
      .select({
        amount: contractorPayments.amount,
        currency: contractorPayments.currency,
        mode: contractorPayments.mode,
      })
      .from(contractorPayments)
      .where(
        and(
          inArray(contractorPayments.projectId, ids),
          gte(contractorPayments.paidOn, since),
        ),
      ),
    db
      .select({
        amount: siteExpenses.amount,
        currency: siteExpenses.currency,
        status: siteExpenses.status,
      })
      .from(siteExpenses)
      .where(
        and(
          inArray(siteExpenses.projectId, ids),
          gte(siteExpenses.spentOn, since),
        ),
      ),
  ]);
  const sum = (xs: { amount: number; currency: string }[]) => {
    const by = new Map<string, number>();
    for (const x of xs)
      by.set(x.currency, (by.get(x.currency) ?? 0) + x.amount);
    return [...by].map(([c, n]) => fmt(n, c)).join(" + ") || "nil";
  };
  return {
    period,
    receivedFromClients: sum(
      inn.map((m) => ({
        amount: m.paidAmount ?? m.amount,
        currency: m.project.office.currency,
      })),
    ),
    paidToContractorsAndLabour: sum(out),
    cashPaidOut: sum(out.filter((x) => x.mode === "Cash")),
    siteExpenses: sum(exp.filter((x) => x.status !== "REJECTED")),
  };
}

export async function followUpsDue(u: U) {
  if (!can(u.role, "leads")) return noAccess("leads");
  const scope = officeScope(u);
  const rows = await db
    .select({
      name: leads.name,
      status: leads.status,
      at: leads.nextFollowUpAt,
    })
    .from(leads)
    .where(
      and(
        scope ? eq(leads.officeId, scope) : undefined,
        lte(leads.nextFollowUpAt, new Date(Date.now() + DAY)),
        inArray(leads.status, [
          "NEW",
          "CONTACTED",
          "SITE_VISIT",
          "DESIGN",
          "QUOTED",
        ]),
      ),
    );
  return {
    followUps: rows.map(
      (l) =>
        `${l.name} (${l.status.toLowerCase().replace("_", " ")}, due ${l.at?.toISOString().slice(0, 10)})`,
    ),
  };
}

export async function lateOrders(u: U) {
  if (!can(u.role, "orders") && !can(u.role, "admin"))
    return noAccess("orders");
  const ids = await liveProjectIds(u);
  if (!ids.length) return { late: [] };
  const rows = await db.query.orders.findMany({
    where: and(
      inArray(orders.projectId, ids),
      ne(orders.status, "DELIVERED"),
      lte(orders.eta, new Date()),
    ),
    with: { project: true },
  });
  return {
    late: rows.map(
      (o) =>
        `${o.item} for ${o.project.name}${o.poNumber ? ` (${o.poNumber})` : ""} — ETA was ${o.eta?.toISOString().slice(0, 10)}, now ${o.status.toLowerCase().replace("_", " ")}`,
    ),
  };
}

// ---------- Answering with Claude ----------

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "project_status",
    description:
      "Progress, current stage, delays, last site update, open snags; money and costs if the person may see them.",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
    },
  },
  {
    name: "contractor_balance",
    description:
      "A contractor's or labourer's account: balance, approved bills, total paid, last payments (owner/accounts).",
    input_schema: {
      type: "object",
      properties: { contractor_id: { type: "string" } },
      required: ["contractor_id"],
    },
  },
  {
    name: "collections_due",
    description: "Client payments due now (all projects, or one).",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string" } },
    },
  },
  {
    name: "approvals_pending",
    description:
      "Site expenses and contractor bills waiting for approval or payment.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "open_snags",
    description: "Open snags (all projects, or one).",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string" } },
    },
  },
  {
    name: "sites_without_update",
    description:
      "Active sites with no site update in the last N days (default 1).",
    input_schema: { type: "object", properties: { days: { type: "number" } } },
  },
  {
    name: "money_summary",
    description:
      "Money received from clients, paid to contractors/labour, cash paid, site expenses for a period.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month"] },
      },
    },
  },
  {
    name: "follow_ups_due",
    description: "Leads with follow-ups due today or overdue.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "late_orders",
    description: "Purchase orders past their ETA and not delivered.",
    input_schema: { type: "object", properties: {} },
  },
];

export async function runLookup(
  u: U,
  name: string,
  input: Record<string, unknown>,
) {
  const s = (k: string) =>
    typeof input[k] === "string" && input[k] ? String(input[k]) : undefined;
  switch (name) {
    case "project_status":
      return projectStatus(u, s("project_id") ?? "");
    case "contractor_balance":
      return contractorBalance(u, s("contractor_id") ?? "");
    case "collections_due":
      return collectionsDue(u, s("project_id"));
    case "approvals_pending":
      return approvalsPending(u);
    case "open_snags":
      return openSnags(u, s("project_id"));
    case "sites_without_update":
      return sitesWithoutUpdate(
        u,
        typeof input.days === "number"
          ? Math.min(30, Math.max(1, input.days))
          : 1,
      );
    case "money_summary":
      return moneySummary(
        u,
        (s("period") as "today" | "week" | "month") ?? "week",
      );
    case "follow_ups_due":
      return followUpsDue(u);
    case "late_orders":
      return lateOrders(u);
  }
  return { error: "Unknown lookup" };
}

export async function answerQuestion(
  u: U,
  question: string,
  ctx: AssistantContext,
) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = `You are Zuki, the assistant inside Zukhti Home's CRM. ${u.name} (${u.role}) asked a question. Use the lookup tools to get facts, then answer in at most 3 short sentences (or a short list), in the same language style they used (English / Hindi / Hinglish). Use only facts from the tools — never guess numbers. If a tool says the role can't see something, say so politely. Today is ${new Date().toISOString().slice(0, 10)}.
Projects (id | name | client):
${ctx.projects.map((p) => `${p.id} | ${p.name} | ${p.client}`).join("\n") || "(none)"}
Contractors (id | name | trade):
${ctx.contractors.map((c) => `${c.id} | ${c.name} | ${c.trade}`).join("\n") || "(none)"}`;
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: question },
  ];
  for (let turn = 0; turn < 5; turn++) {
    const res = await client.messages.create(
      {
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 800,
        system,
        tools: TOOLS,
        messages,
        thinking: { type: "disabled" },
      },
      { timeout: 40_000, maxRetries: 1 },
    );
    const calls = res.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    if (!calls.length || res.stop_reason !== "tool_use") {
      return (
        res.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim() || "I couldn't find an answer to that."
      );
    }
    messages.push({ role: "assistant", content: res.content });
    const results = await Promise.all(
      calls.map(async (c) => ({
        type: "tool_result" as const,
        tool_use_id: c.id,
        content: JSON.stringify(
          await runLookup(
            u,
            c.name,
            (c.input ?? {}) as Record<string, unknown>,
          ),
        ),
      })),
    );
    messages.push({ role: "user", content: results });
  }
  return "That needed too many lookups — try asking something more specific.";
}

// ---------- Answering without AI (keyword routes) ----------

function list(title: string, xs: string[], empty: string) {
  return xs.length
    ? `${title}\n• ${xs.slice(0, 8).join("\n• ")}${xs.length > 8 ? `\n…and ${xs.length - 8} more` : ""}`
    : empty;
}

export async function basicAnswer(
  u: U,
  q: string,
  projectId: string | null,
  contractorId: string | null,
) {
  const t = q.toLowerCase();
  if (
    contractorId &&
    /balance|baaki|baki|dena|owe|account|hisab|hisaab|paid|kitna/.test(t)
  ) {
    const r = await contractorBalance(u, contractorId);
    if ("error" in r) return r.error as string;
    return `${r.contractor}: ${r.balance}. Approved bills ${r.approvedBills}, paid ${r.totalPaid}.`;
  }
  if (/approv/.test(t)) {
    const r = await approvalsPending(u);
    if ("error" in r) return r.error as string;
    return [
      list(
        "Expenses to approve:",
        r.expensesToApprove ?? [],
        "No expenses waiting.",
      ),
      list("Bills to approve:", r.billsToApprove ?? [], "No bills waiting."),
    ].join("\n");
  }
  if (/snag/.test(t)) {
    const r = await openSnags(u, projectId ?? undefined);
    return list(`${r.count ?? 0} open snag(s):`, r.snags, "No open snags.");
  }
  if (/no update|without update|update nahi|not updated|silent/.test(t)) {
    const r = await sitesWithoutUpdate(u, 1);
    return list(
      "No update today from:",
      r.withoutUpdate,
      `All ${r.activeSites} active sites have an update today.`,
    );
  }
  if (/follow.?up/.test(t)) {
    const r = await followUpsDue(u);
    if ("error" in r) return r.error as string;
    return list("Follow-ups due:", r.followUps, "No follow-ups due.");
  }
  if (
    /late|delay|overdue order|eta/.test(t) &&
    /order|delivery|sofa|shipment|po\b/.test(t)
  ) {
    const r = await lateOrders(u);
    if ("error" in r) return r.error as string;
    return list("Late orders:", r.late, "No orders are late.");
  }
  if (
    /today|this week|week|month|mahine|aaj/.test(t) &&
    /money|cash|paid|received|collection|kharcha|spent|summary/.test(t)
  ) {
    const period = /today|aaj/.test(t)
      ? "today"
      : /month|mahine/.test(t)
        ? "month"
        : "week";
    const r = await moneySummary(u, period);
    if ("error" in r) return r.error as string;
    return `This ${period === "today" ? "day" : period}: received ${r.receivedFromClients}, paid to contractors/labour ${r.paidToContractorsAndLabour} (cash ${r.cashPaidOut}), site expenses ${r.siteExpenses}.`;
  }
  if (/pending|due|outstanding|collection|aana|baaki/.test(t)) {
    const r = await collectionsDue(u, projectId ?? undefined);
    if ("error" in r) return r.error as string;
    return list(
      "Client payments due now:",
      r.dueNow ?? [],
      "No client payments are due right now.",
    );
  }
  if (projectId) {
    const r = await projectStatus(u, projectId);
    if ("error" in r) return r.error as string;
    const m = r.money as { pending: string } | undefined;
    return `${r.project}: ${r.progress} done, now on ${r.currentStage}. ${(r.behindPlan as string[]).length ? `Behind plan: ${(r.behindPlan as string[]).join(", ")}. ` : ""}Open snags: ${r.openSnags}.${m ? ` Pending from client: ${m.pending}.` : ""}`;
  }
  return "I can answer things like “What's Ramesh's balance?”, “How much is pending from Shah?”, “Which sites have no update today?”, “Open snags at Mehta”, or “Money this week”.";
}
