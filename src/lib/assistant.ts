import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray } from "drizzle-orm";
import { contractorBills, db, workOrders } from "@/db";
import { callTool } from "./ai-call";
import { can, canIntake, type Capability } from "./permissions";
import { scopedContractors, scopedProjects } from "./site-ops";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_MODES,
  type ActionType,
  type AssistantAction,
  type AssistantContext,
  type Missing,
} from "./assistant-types";
import type { Role } from "@/db/schema";

type U = { id: string; name: string; role: Role; officeId: string | null };

const NEEDS: Partial<Record<ActionType, Capability>> = {
  payment: "payouts",
  expense: "expenses",
  snag: "snags",
  project_update: "voice",
  bill: "contractors",
  measurements: "boq",
  question: "voice",
};

export async function assistantContext(user: U): Promise<AssistantContext> {
  const [projects, contractors, openWos] = await Promise.all([
    scopedProjects(user, true),
    can(user.role, "payouts") ||
    can(user.role, "snags") ||
    can(user.role, "contractors")
      ? scopedContractors(user)
      : Promise.resolve([]),
    can(user.role, "contractors")
      ? db
          .select({
            id: workOrders.id,
            number: workOrders.number,
            title: workOrders.title,
            contractorId: workOrders.contractorId,
            projectId: workOrders.projectId,
          })
          .from(workOrders)
          .where(eq(workOrders.status, "OPEN"))
      : Promise.resolve([]),
  ]);
  const allowed = (
    [
      "payment",
      "expense",
      "snag",
      "project_update",
      "new_lead",
      "new_contractor",
      "open",
      "bill",
      "measurements",
      "question",
    ] as ActionType[]
  ).filter((t) =>
    t === "new_lead" || t === "new_contractor"
      ? canIntake(user.role)
      : t === "open" || t === "question"
        ? true
        : can(user.role, NEEDS[t]!),
  );
  return {
    // Live projects first; handed-over ones stay available for snags after handover.
    projects: [...projects]
      .sort(
        (a, b) =>
          Number(a.status === "HANDED_OVER") -
          Number(b.status === "HANDED_OVER"),
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        client: p.client.name,
        currency: p.office.currency,
      })),
    contractors: contractors
      .filter((c) => c.active)
      .map((c) => ({ id: c.id, name: c.name, trade: c.trade })),
    workOrders: openWos.filter((w) =>
      projects.some((p) => p.id === w.projectId),
    ),
    allowed,
  };
}

// ---------- Understanding with AI ----------

const PLAN_TOOL = {
  name: "plan_actions",
  description: "Turn what the team member said into CRM actions.",
  input_schema: {
    type: "object" as const,
    properties: {
      reply: {
        type: "string",
        description:
          "One short, friendly sentence confirming what you understood (same language style as the speaker).",
      },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "payment",
                "expense",
                "snag",
                "project_update",
                "new_lead",
                "new_contractor",
                "open",
                "bill",
                "measurements",
                "question",
              ],
            },
            project_id: {
              type: "string",
              description: "Exact id from the project list, or empty.",
            },
            contractor_id: {
              type: "string",
              description: "Exact id from the contractor list, or empty.",
            },
            contractor_name: {
              type: "string",
              description:
                "Name as spoken if no contractor in the list matches.",
            },
            amount: {
              type: "number",
              description:
                "Amount in the project's currency (lakh = 100000, k = 1000).",
            },
            mode: { type: "string", enum: ["", ...PAYMENT_MODES] },
            kind: {
              type: "string",
              enum: ["", "ADVANCE", "WAGES", "OTHER"],
              description:
                "Payments: ADVANCE (advance/against work), WAGES (daily labour), OTHER.",
            },
            reference: {
              type: "string",
              description: "UTR / UPI / cheque reference if said.",
            },
            note: { type: "string" },
            category: { type: "string", enum: ["", ...EXPENSE_CATEGORIES] },
            description: {
              type: "string",
              description:
                "Expenses: what it was for. Snags: what needs fixing, in clear English.",
            },
            paid_to: {
              type: "string",
              description: "Expenses: shop or person paid.",
            },
            room: { type: "string", description: "Snags: room or area." },
            photo_skipped: {
              type: "boolean",
              description:
                "Snags: true if the speaker said there is no photo / skip photo.",
            },
            text: {
              type: "string",
              description:
                "project_update / new_lead / new_contractor / question / measurements: the exact part of what was said that belongs to this action.",
            },
            work_order_id: {
              type: "string",
              description: "bill: exact work order id from the list, if clear.",
            },
          },
          required: ["type"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

function system(ctx: AssistantContext, user: U, today: string) {
  return `You are Zuki, the voice assistant inside Zukhti Home's CRM (turnkey interior design, Mumbai / Dubai). ${user.name} (${user.role}) speaks English, Hindi or Hinglish.
Decide what each thing they said is, and output CRM actions. Today is ${today}.
Action types (only these are allowed for this person: ${ctx.allowed.join(", ")}):
- payment: money WE paid TO a contractor, labourer or helper (advance, wages, against work). Needs contractor, project, amount, mode.
- expense: cash WE spent on site — material, transport, tools, food (not to a contractor). Needs project, amount, description.
- snag: a defect / problem on site that needs fixing (scratch, crack, leak, misalignment, touch-up). Needs project, description, room if said.
- project_update: anything about site progress, stages, work done, issues, client payments RECEIVED, orders/deliveries, visits/meetings, design decisions. Put the spoken words in "text".
- new_lead: a new client enquiry to add. Put the spoken words in "text".
- new_contractor: a new contractor/labourer to add to the system. Put the spoken words in "text".
- open: they want to see/open a project or contractor page.
- bill: a contractor's RUNNING BILL submitted for work done (not a payment). Needs contractor, project, amount; work order if more than one is open.
- measurements: room sizes / site measurements to use for a BOQ. Put the sizes in "text".
- question: they are ASKING something (balance, pending, status, snags, who hasn't updated, money this week…). Put the question in "text". Don't create other actions for a question.
Rules:
- You receive the CURRENT actions (from earlier in this conversation). Return the FULL updated list: keep them, fill in what the new words answer, change only what the speaker corrects. If they were asked a question, the new words most likely answer it.
- One utterance can contain several actions.
- Use ONLY ids from the lists below. Match names loosely (first name, surname, firm name, client name, area). If unsure, leave the id empty — never guess between two similar names.
- Never invent amounts, modes or projects that weren't said. "cash/nakad" = Cash; "GPay/PhonePe/Paytm/UPI" = UPI; "NEFT/IMPS/RTGS/bank" = Bank transfer.
- If something is outside the allowed types, don't create it; say so in reply.
Projects (id | name | client):
${ctx.projects.map((p) => `${p.id} | ${p.name} | ${p.client}`).join("\n") || "(none)"}
Contractors (id | name | trade):
${ctx.contractors.map((c) => `${c.id} | ${c.name} | ${c.trade}`).join("\n") || "(none)"}
Open work orders (id | number | title | contractor id | project id):
${ctx.workOrders.map((w) => `${w.id} | ${w.number} | ${w.title} | ${w.contractorId} | ${w.projectId}`).join("\n") || "(none)"}`;
}

type RawAction = {
  type?: string;
  project_id?: string;
  contractor_id?: string;
  contractor_name?: string;
  amount?: number;
  mode?: string;
  kind?: string;
  reference?: string;
  note?: string;
  category?: string;
  description?: string;
  paid_to?: string;
  room?: string;
  photo_skipped?: boolean;
  text?: string;
  work_order_id?: string;
};

function toRaw(a: AssistantAction): RawAction {
  return {
    type: a.type,
    project_id: a.projectId ?? "",
    contractor_id: a.contractorId ?? "",
    contractor_name: a.contractorName ?? "",
    amount: a.amount ?? undefined,
    mode: a.mode ?? "",
    kind: a.kind && a.kind !== "BILL" ? a.kind : "",
    reference: a.reference ?? "",
    note: a.note ?? "",
    category: a.category ?? "",
    description: a.description ?? "",
    paid_to: a.paidTo ?? "",
    room: a.room ?? "",
    photo_skipped: a.photoSkipped ?? false,
    text: a.text ?? "",
    work_order_id: a.workOrderId ?? "",
  };
}

export async function aiPlan(
  text: string,
  current: AssistantAction[],
  asking: { index: number; field: string } | null,
  ctx: AssistantContext,
  user: U,
  today: string,
) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const out = await callTool<{ reply?: string; actions?: RawAction[] }>(
    client,
    {
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1500,
      system: system(ctx, user, today),
      tools: [PLAN_TOOL],
      messages: [
        {
          role: "user",
          content: `CURRENT actions: ${JSON.stringify(current.map(toRaw))}\n${asking ? `You had asked about action #${asking.index + 1}, field "${asking.field}".\n` : ""}\nThey said:\n"""${text}"""`,
        },
      ],
    },
    PLAN_TOOL.name,
  );
  return { reply: out.reply ?? "", actions: (out.actions ?? []).map(fromRaw) };
}

function fromRaw(r: RawAction): AssistantAction {
  const s = (v?: string) => (v && v.trim() ? v.trim() : null);
  return {
    type: (r.type as ActionType) ?? "project_update",
    projectId: s(r.project_id),
    contractorId: s(r.contractor_id),
    contractorName: s(r.contractor_name),
    amount:
      typeof r.amount === "number" && r.amount > 0
        ? Math.round(r.amount * 100) / 100
        : null,
    mode: s(r.mode),
    kind: (s(r.kind) as AssistantAction["kind"]) ?? null,
    reference: s(r.reference),
    note: s(r.note),
    category: s(r.category),
    description: s(r.description),
    paidTo: s(r.paid_to),
    room: s(r.room),
    photoSkipped: !!r.photo_skipped,
    text: s(r.text),
    workOrderId: s(r.work_order_id),
  };
}

// ---------- Understanding without AI (rule-based) ----------

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
const STOPWORDS = new Set([
  "the",
  "and",
  "residence",
  "apartment",
  "villa",
  "flat",
  "home",
  "house",
  "works",
  "work",
  "contractors",
  "contractor",
  "west",
  "east",
  "road",
  "tower",
  "helper",
]);

/** Best match by shared words (≥4 letters), or null when ambiguous. */
function bestMatch<T>(text: string, items: T[], keys: (t: T) => string[]) {
  const said = new Set(words(text));
  const scored = items
    .map((it) => {
      const ws = keys(it)
        .flatMap(words)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
      return { it, score: ws.filter((w) => said.has(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length || (scored[1] && scored[1].score === scored[0].score))
    return null;
  return scored[0].it;
}

export function parseAmount(text: string) {
  const t = text.toLowerCase().replace(/(\d),(?=\d)/g, "$1");
  const re =
    /(₹|rs\.?|inr|aed|rupees?|for|of|paid|diya|diye)?\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|l\b|k\b|thousand|hazaar|hazar|crore|cr\b|rupees?|rs\b|aed|\/-)?\s*([a-z%]+)?/g;
  const found: { n: number; marked: boolean }[] = [];
  for (const m of t.matchAll(re)) {
    const [, pre = "", num, unit = "", next = ""] = m;
    if (num.replace(".", "").length >= 8 && !unit) continue; // phone numbers, references
    // Quantities, not money: "20 bags", "3 bhk", "80%", "6 days".
    if (
      !unit &&
      /^(bags?|sheets?|pcs|pieces?|nos|sq|sqft|ft|feet|days?|din|percent|kg|kgs|litres?|boxes?|rolls?|units?|bhk|bedrooms?|am|pm|%|tak|baje|hours?|ghante)$/.test(
        next,
      )
    )
      continue;
    if (/%/.test(m[0])) continue;
    let n = Number(num);
    if (/^la|^l$/.test(unit)) n *= 100000;
    else if (/^k$|thousand|hazaa?r/.test(unit)) n *= 1000;
    else if (/^cr/.test(unit)) n *= 10000000;
    if (n > 0)
      found.push({
        n,
        marked: !!(pre && /₹|rs|inr|aed|rupee/.test(pre)) || !!unit,
      });
  }
  return (
    (found.find((f) => f.marked) ?? found[found.length - 1] ?? null)?.n ?? null
  );
}

function parseMode(text: string) {
  const t = text.toLowerCase();
  if (/\b(cash|nakad|nagad)\b/.test(t)) return "Cash";
  if (/\b(upi|gpay|google pay|phonepe|phone pe|paytm|bhim)\b/.test(t))
    return "UPI";
  if (/\b(neft|imps|rtgs|bank|transfer|account)\b/.test(t))
    return "Bank transfer";
  if (/\b(cheque|check)\b/.test(t)) return "Cheque";
  return null;
}

const ROOMS = [
  "kitchen",
  "living",
  "dining",
  "master bedroom",
  "kids bedroom",
  "guest bedroom",
  "bedroom",
  "bathroom",
  "toilet",
  "balcony",
  "entrance",
  "lobby",
  "study",
  "puja",
  "utility",
  "wardrobe",
];

export function looksLikeQuestion(text: string) {
  const t = text.trim().toLowerCase();
  return (
    /\?\s*$/.test(t) ||
    /^(what|what's|whats|how much|how many|which|who|when|where|is there|are there|do we|did we|have we|tell me|show me|give me|list|kitna|kitne|kitni|kaun|kya|kab|kahan|bata|batao|dikhao)\b/.test(
      t,
    ) ||
    /\b(balance|kitna baaki|kitna pending|status kya|pending kitna)\b/.test(t)
  );
}

function classify(text: string): ActionType {
  const t = text.toLowerCase();
  if (looksLikeQuestion(text)) return "question";
  if (/\b(new lead|naya lead|new enquiry|new inquiry|new client)\b/.test(t))
    return "new_lead";
  if (
    /\b(add (a |new )?(contractor|labour|helper)|new contractor|naya contractor)\b/.test(
      t,
    )
  )
    return "new_contractor";
  if (
    /\b(client|customer)\b.*\b(paid|payment|transferred|mila|diya)\b|\b(received|mila)\b/.test(
      t,
    )
  )
    return "project_update";
  if (
    /\b(paid|pay|diya|diye|de diya|bheja|bhej diya|transferred|advance|wages|mazdoori|majdoori)\b/.test(
      t,
    )
  )
    return "payment";
  if (
    /\b(snag|defect|crack|scratch|leak|leaking|damage|damaged|dent|not aligned|misaligned|chipped|stain|toota|tuta|kharab|touch ?up|uneven|gap)\b/.test(
      t,
    )
  )
    return "snag";
  if (
    /\b(expense|kharcha|kharch|bought|kharida|purchased|spent|tempo|transport|auto fare|chai)\b/.test(
      t,
    )
  )
    return "expense";
  if (
    /\b(bill|ra ?\d|running bill)\b/.test(t) &&
    /\b(contractor|carpenter|painter|electrician|plumber|billed|submitted|diya)\b/.test(
      t,
    )
  )
    return "bill";
  if (/\b(open|show|dikhao)\b/.test(t)) return "open";
  return "project_update";
}

export function basicPlan(
  text: string,
  current: AssistantAction[],
  asking: { index: number; field: string } | null,
  ctx: AssistantContext,
): { reply: string; actions: AssistantAction[] } {
  const actions = current.map((a) => ({ ...a }));
  const project = bestMatch(text, ctx.projects, (p) => [p.name, p.client]);
  const contractor = bestMatch(text, ctx.contractors, (c) => [c.name]);
  const amount = parseAmount(text);
  const mode = parseMode(text);

  if (asking && actions[asking.index]) {
    // The words answer the question we asked.
    const a = actions[asking.index];
    const f = asking.field;
    if (f === "projectId" && project) a.projectId = project.id;
    else if (f === "contractorId" && contractor) a.contractorId = contractor.id;
    else if (f === "amount" && amount) a.amount = amount;
    else if (f === "mode" && mode) a.mode = mode;
    else if (f === "description") a.description = text.trim();
    else if (
      f === "photo" &&
      /\b(skip|no|nahi|nahin|later|baad|without)\b/i.test(text)
    )
      a.photoSkipped = true;
    // Fill anything else they happened to mention.
    if (!a.projectId && project) a.projectId = project.id;
    if (a.type === "payment") {
      if (!a.contractorId && contractor) a.contractorId = contractor.id;
      if (!a.amount && amount) a.amount = amount;
      if (!a.mode && mode) a.mode = mode;
    }
    return { reply: "", actions };
  }

  const type = classify(text);
  const a: AssistantAction = { type, projectId: project?.id ?? null };
  if (type === "payment") {
    a.contractorId = contractor?.id ?? null;
    a.amount = amount;
    a.mode = mode;
    a.kind = /\b(wages|mazdoori|majdoori|daily|din ka)\b/i.test(text)
      ? "WAGES"
      : "ADVANCE";
    a.note = text.trim().slice(0, 300);
  } else if (type === "expense") {
    a.amount = amount;
    a.description = text.trim().slice(0, 300);
    a.category = /\b(tempo|transport|auto|taxi|fare)\b/i.test(text)
      ? "Transport"
      : /\b(chai|food|lunch|nashta)\b/i.test(text)
        ? "Food & site"
        : /\b(tools?|drill|bits|screws|fevicol|tape)\b/i.test(text)
          ? "Tools & consumables"
          : "Material";
  } else if (type === "snag") {
    a.description = text.trim().slice(0, 500);
    a.room =
      ROOMS.find((r) => text.toLowerCase().includes(r))?.replace(/\b\w/g, (c) =>
        c.toUpperCase(),
      ) ?? null;
    a.contractorId = contractor?.id ?? null;
  } else if (type === "open") {
    a.contractorId = contractor?.id ?? null;
  } else if (type === "bill") {
    a.contractorId = contractor?.id ?? null;
    a.amount = amount;
    a.note = text.trim().slice(0, 300);
  } else if (type === "question") {
    a.text = text.trim();
    a.contractorId = contractor?.id ?? null;
  } else {
    a.text = text.trim();
  }
  actions.push(a);
  return { reply: "", actions };
}

// ---------- Checking what's still needed ----------

const Q = {
  projectId: (a: AssistantAction) =>
    a.type === "snag"
      ? "Which project is this snag in?"
      : a.type === "payment"
        ? "For which project was this payment?"
        : a.type === "expense"
          ? "Which project was this expense for?"
          : "Which project is this for?",
  contractorId: (a: AssistantAction) =>
    a.contractorName
      ? `I couldn't find “${a.contractorName}” in your contractors. Which contractor was it? (Add them first if they're new.)`
      : a.type === "bill"
        ? "Which contractor's bill is this?"
        : "Which contractor or labourer did you pay?",
  amount: (a: AssistantAction) =>
    a.type === "payment"
      ? "How much did you pay?"
      : a.type === "bill"
        ? "What's the bill amount?"
        : "How much was spent?",
  workOrderId: () =>
    "Which work order is this bill for? Choose it on the card.",
  mode: () => "How was it paid — cash, UPI, bank transfer or cheque?",
  description: (a: AssistantAction) =>
    a.type === "snag"
      ? "What exactly needs fixing?"
      : "What was the money spent on?",
  photo: () =>
    "Can you add a photo of the snag? Tap the camera button — or say “skip”.",
};
const LABEL: Record<string, string> = {
  projectId: "Project",
  contractorId: "Contractor",
  amount: "Amount",
  mode: "Paid by",
  description: "Details",
  photo: "Photo",
  workOrderId: "Work order",
};

/** Cleans ids against what this person may see, attaches matching bills, and lists what's missing. */
export async function finalize(
  actions: AssistantAction[],
  ctx: AssistantContext,
  photos: Set<number>,
) {
  const projectIds = new Set(ctx.projects.map((p) => p.id));
  const contractorIds = new Set(ctx.contractors.map((c) => c.id));
  const kept: AssistantAction[] = [];
  const blocked: ActionType[] = [];
  for (const a of actions) {
    if (!ctx.allowed.includes(a.type)) {
      blocked.push(a.type);
      continue;
    }
    if (a.projectId && !projectIds.has(a.projectId)) a.projectId = null;
    if (a.contractorId && !contractorIds.has(a.contractorId))
      a.contractorId = null;
    if (a.mode && !(PAYMENT_MODES as readonly string[]).includes(a.mode))
      a.mode = null;
    if (
      a.category &&
      !(EXPENSE_CATEGORIES as readonly string[]).includes(a.category)
    )
      a.category = "Other";
    if (
      a.workOrderId &&
      !ctx.workOrders.some(
        (w) =>
          w.id === a.workOrderId &&
          w.contractorId === a.contractorId &&
          w.projectId === a.projectId,
      )
    )
      a.workOrderId = null;
    if (a.type === "bill" && !a.workOrderId && a.contractorId && a.projectId) {
      // One open work order for this contractor on this project: bill it there.
      const wos = ctx.workOrders.filter(
        (w) => w.contractorId === a.contractorId && w.projectId === a.projectId,
      );
      if (wos.length === 1) a.workOrderId = wos[0].id;
    }
    if (a.type === "open") {
      a.href = a.projectId
        ? `/projects/${a.projectId}`
        : a.contractorId
          ? `/desk/contractors/${a.contractorId}`
          : null;
    }
    kept.push(a);
  }

  // A payment that matches an approved, unpaid bill exactly pays that bill.
  for (const a of kept.filter(
    (x) =>
      x.type === "payment" &&
      x.contractorId &&
      x.projectId &&
      x.amount &&
      x.kind !== "WAGES",
  )) {
    const bills = await db
      .select({
        id: contractorBills.id,
        amount: contractorBills.amount,
        note: contractorBills.note,
        number: workOrders.number,
      })
      .from(contractorBills)
      .innerJoin(workOrders, eq(workOrders.id, contractorBills.workOrderId))
      .where(
        and(
          eq(workOrders.contractorId, a.contractorId!),
          eq(workOrders.projectId, a.projectId!),
          inArray(contractorBills.status, ["APPROVED"]),
        ),
      );
    const hit = bills.find((b) => Math.abs(b.amount - a.amount!) < 0.5);
    if (hit) {
      a.kind = "BILL";
      a.billId = hit.id;
      a.billLabel = `${hit.number}${hit.note ? ` · ${hit.note}` : ""}`;
    } else if (a.kind === "BILL") {
      a.kind = "ADVANCE";
      a.billId = null;
    }
  }

  const missing: Missing[] = [];
  kept.forEach((a, i) => {
    const need: string[] = [];
    if (a.type === "payment")
      need.push("contractorId", "projectId", "amount", "mode");
    if (a.type === "expense") need.push("projectId", "amount", "description");
    if (a.type === "snag") need.push("projectId", "description");
    if (a.type === "project_update" || a.type === "measurements")
      need.push("projectId");
    if (a.type === "bill")
      need.push("contractorId", "projectId", "amount", "workOrderId");
    for (const f of need) {
      const v = (a as Record<string, unknown>)[f];
      if (v === null || v === undefined || v === "")
        missing.push({
          index: i,
          field: f,
          label: LABEL[f],
          question: Q[f as keyof typeof Q](a),
        });
    }
    if (a.type === "snag" && !photos.has(i) && !a.photoSkipped)
      missing.push({
        index: i,
        field: "photo",
        label: LABEL.photo,
        question: Q.photo(),
        optional: true,
      });
    if (
      a.type === "bill" &&
      a.contractorId &&
      a.projectId &&
      !a.workOrderId &&
      !ctx.workOrders.some(
        (w) => w.contractorId === a.contractorId && w.projectId === a.projectId,
      )
    ) {
      const m = missing.find((x) => x.index === i && x.field === "workOrderId");
      if (m)
        m.question =
          "This contractor has no open work order on that project. Raise a work order first (Contractors → their page).";
    }
    if (a.type === "open" && !a.href)
      missing.push({
        index: i,
        field: "projectId",
        label: "What to open",
        question: "Which project or contractor should I open?",
      });
  });
  return { actions: kept, missing, blocked };
}

export const BLOCKED_TEXT: Record<ActionType, string> = {
  bill: "Your role can't submit contractor bills.",
  measurements: "Only roles that prepare BOQs can use measurements.",
  question: "",
  payment: "Only the owner and accounts can record payments to contractors.",
  expense: "Your role can't log site expenses.",
  snag: "Your role can't add snags.",
  project_update: "Your role can't post project updates.",
  new_lead: "Only the owner and admins can add leads by voice.",
  new_contractor: "Only the owner and admins can add contractors by voice.",
  open: "",
};
