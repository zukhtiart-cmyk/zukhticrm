import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Role } from "@/db/schema";
import { can } from "./permissions";
import type { VoiceProposal } from "./voice-types";

export type VoiceContext = {
  today: string; // YYYY-MM-DD in the office's day
  speaker: { name: string; role: Role };
  project: { name: string; code: string; currency: string; office: string; clientName: string; clientLanguage: string; progress: number; expectedHandover: string | null };
  stages: { id: string; name: string; status: string; progress: number }[];
  milestones: { id: string; label: string; amount: number; status: string }[];
  orders: { id: string; item: string; vendor: string | null; status: string; eta: string | null }[];
  visits: { id: string; title: string; at: string }[];
};

// ---------- Speech to text ----------

export async function transcribe(audio: File, hint: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Speech-to-text isn't set up yet (OPENAI_API_KEY). Type the update instead.");
  const body = new FormData();
  body.append("file", audio, audio.name || "voice.webm");
  body.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe");
  body.append("prompt", hint);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { code?: string; type?: string; message?: string } } | null;
    const code = err?.error?.code || err?.error?.type || "";
    if (code === "insufficient_quota")
      throw new Error("Voice-to-text isn't available: the OpenAI account has no credit. Add credit at platform.openai.com → Settings → Billing, or use phone voice typing / type the update.");
    if (res.status === 401) throw new Error("Voice-to-text key is not valid. Check OPENAI_API_KEY in Vercel, or use phone voice typing / type the update.");
    if (res.status === 429) throw new Error("Voice-to-text is busy (rate limit). Wait a minute and try again, or use phone voice typing / type the update.");
    throw new Error(`Couldn't transcribe the recording (${res.status}${err?.error?.message ? `: ${err.error.message}` : ""}). Try again or type it.`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

// ---------- Understanding ----------

const TOOL = {
  name: "record_site_update",
  description: "Record the structured changes contained in a team member's spoken site update.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "1–2 sentence internal summary in English of what was reported." },
      stage_updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            stage_id: { type: "string", description: "Exact id from the stage list." },
            status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "DONE"] },
            progress: { type: "integer", minimum: 0, maximum: 100 },
            note: { type: "string" },
          },
          required: ["stage_id", "status", "progress"],
        },
      },
      payments: {
        type: "array",
        description: "Money received from the client against a milestone.",
        items: {
          type: "object",
          properties: {
            milestone_id: { type: "string" },
            amount: { type: "number", description: "In the project currency. 1 lakh = 100000, 1 crore = 10000000." },
            reference: { type: "string", description: "Payment mode or reference, e.g. NEFT, cheque 123." },
            paid_on: { type: "string", description: "YYYY-MM-DD" },
          },
          required: ["milestone_id", "amount"],
        },
      },
      orders: {
        type: "array",
        items: {
          type: "object",
          properties: {
            order_id: { type: ["string", "null"], description: "Existing order id, or null for a new order." },
            item: { type: "string" },
            vendor: { type: "string" },
            status: { type: "string", enum: ["ORDERED", "IN_PRODUCTION", "SHIPPED", "CUSTOMS", "DELIVERED"] },
            eta: { type: "string", description: "YYYY-MM-DD" },
          },
          required: ["order_id", "item", "status"],
        },
      },
      visits: {
        type: "array",
        description: "Site visits or meetings scheduled or moved.",
        items: {
          type: "object",
          properties: {
            visit_id: { type: ["string", "null"], description: "Existing visit id when moving one, else null." },
            title: { type: "string" },
            at: { type: "string", description: "Local date-time, YYYY-MM-DDTHH:MM" },
          },
          required: ["visit_id", "title", "at"],
        },
      },
      design_notes: { type: "array", items: { type: "string" }, description: "Design approvals or changes." },
      issues: { type: "array", items: { type: "string" }, description: "Problems, delays, or things waiting on someone." },
      client_message: {
        type: "string",
        description:
          "A warm, short WhatsApp update for the client in their language, addressed by name. Only client-appropriate facts: progress, what was done, what's next, dates. Never include vendor names, costs, margins, internal issues or blame. No markdown except *bold*.",
      },
      clarification_question: {
        type: ["string", "null"],
        description: "Ask ONE short question only if something essential is ambiguous (e.g. which stage). Otherwise null.",
      },
    },
    required: ["summary", "stage_updates", "payments", "orders", "visits", "design_notes", "issues", "client_message", "clarification_question"],
  },
};

function systemPrompt(ctx: VoiceContext) {
  const allowed = [
    can(ctx.speaker.role, "stages") && "stage updates",
    can(ctx.speaker.role, "payments") && "payments",
    can(ctx.speaker.role, "orders") && "orders",
    can(ctx.speaker.role, "visits") && "visits",
    can(ctx.speaker.role, "design") && "design notes",
  ].filter(Boolean);
  return `You turn spoken site updates from Zukhti Home's interior design and turnkey contracting team into structured CRM changes.
The speaker may use English, Hindi, Hinglish or Arabic, and site slang (e.g. "carcass", "POP", "laminate", "shuttering").

Rules:
- Use ONLY ids from the project data below. Never invent ids, amounts, dates or progress the speaker didn't say or clearly imply.
- "done", "complete", "finished", "ho gaya" => status DONE, progress 100. Work started but not finished without a % => IN_PROGRESS with a sensible estimate only if the speaker implies one; otherwise keep the stage's current progress.
- Resolve relative dates ("Tuesday", "next Monday", "kal") from today's date: ${ctx.today}.
- This speaker (${ctx.speaker.role}) may record: ${allowed.join(", ") || "notes only"}. Leave other categories empty, but mention them in issues if they matter.
- Amounts are in ${ctx.project.currency}.
- Write the client message in ${ctx.project.clientLanguage === "ar" ? "Arabic" : ctx.project.clientLanguage === "hi" ? "Hindi" : "English"}.
- Always call the record_site_update tool.

Project data:
${JSON.stringify(ctx, null, 1)}`;
}

export async function understand(transcript: string, ctx: VoiceContext): Promise<VoiceProposal> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 2000,
    system: systemPrompt(ctx),
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: `Spoken update from ${ctx.speaker.name}:\n"""${transcript}"""` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("The AI didn't return an update. Try again.");
  return sanitize(block.input as RawProposal, ctx);
}

export type RawProposal = {
  summary?: string;
  stage_updates?: { stage_id: string; status: string; progress: number; note?: string }[];
  payments?: { milestone_id: string; amount: number; reference?: string; paid_on?: string }[];
  orders?: { order_id: string | null; item: string; vendor?: string; status: string; eta?: string }[];
  visits?: { visit_id: string | null; title: string; at: string }[];
  design_notes?: string[];
  issues?: string[];
  client_message?: string;
  clarification_question?: string | null;
};

const STAGE = ["NOT_STARTED", "IN_PROGRESS", "DONE"] as const;
const ORDER = ["ORDERED", "IN_PRODUCTION", "SHIPPED", "CUSTOMS", "DELIVERED"] as const;

/** Drops anything referencing unknown ids or outside the speaker's role. */
export function sanitize(raw: RawProposal, ctx: VoiceContext): VoiceProposal {
  const role = ctx.speaker.role;
  const stageIds = new Set(ctx.stages.map((s) => s.id));
  const msIds = new Set(ctx.milestones.map((m) => m.id));
  const orderIds = new Set(ctx.orders.map((o) => o.id));
  const visitIds = new Set(ctx.visits.map((v) => v.id));
  return {
    summary: raw.summary?.trim() || "Site update",
    stageUpdates: can(role, "stages")
      ? (raw.stage_updates ?? [])
          .filter((s) => stageIds.has(s.stage_id) && (STAGE as readonly string[]).includes(s.status))
          .map((s) => ({ stageId: s.stage_id, status: s.status as (typeof STAGE)[number], progress: Math.max(0, Math.min(100, Math.round(s.progress))), note: s.note }))
      : [],
    payments: can(role, "payments") ? (raw.payments ?? []).filter((p) => msIds.has(p.milestone_id) && p.amount > 0).map((p) => ({ milestoneId: p.milestone_id, amount: p.amount, reference: p.reference, paidOn: p.paid_on })) : [],
    orders: can(role, "orders")
      ? (raw.orders ?? [])
          .filter((o) => o.item && (ORDER as readonly string[]).includes(o.status))
          .map((o) => ({ orderId: o.order_id && orderIds.has(o.order_id) ? o.order_id : null, item: o.item, vendor: o.vendor, status: o.status as (typeof ORDER)[number], eta: o.eta }))
      : [],
    visits: can(role, "visits") ? (raw.visits ?? []).filter((v) => v.title && v.at).map((v) => ({ visitId: v.visit_id && visitIds.has(v.visit_id) ? v.visit_id : null, title: v.title, at: v.at })) : [],
    designNotes: can(role, "design") ? (raw.design_notes ?? []).filter(Boolean) : [],
    issues: (raw.issues ?? []).filter(Boolean),
    clientMessage: raw.client_message?.trim() ?? "",
    clarification: raw.clarification_question?.trim() || null,
  };
}

// ---------- Basic mode (no AI key) ----------

/**
 * Keyword fallback so the desk still works before the AI key is added:
 * finds stage names in the text and a nearby percentage or "done".
 */
export function basicUnderstand(transcript: string, ctx: VoiceContext): VoiceProposal {
  const text = transcript.toLowerCase();
  const stageUpdates: VoiceProposal["stageUpdates"] = [];
  if (can(ctx.speaker.role, "stages")) {
    for (const s of ctx.stages) {
      const key = s.name.toLowerCase().split(/[\s&]+/)[0];
      const idx = key.length > 3 ? text.indexOf(key) : -1;
      if (idx === -1) continue;
      // Look at the phrase about this stage (up to the next comma, full stop or "and"),
      // plus the following phrase if it doesn't name a different stage.
      const keys = ctx.stages.map((x) => x.name.toLowerCase().split(/[\s&]+/)[0]).filter((k) => k.length > 3 && k !== key);
      const [first = "", second = ""] = text.slice(idx, idx + 120).split(/[,.;\n]| and /);
      const read = (w: string) => ({ pct: w.match(/(\d{1,3})\s?(%|percent)/), done: /\b(done|complete|completed|finished|ho gaya)\b/.test(w) });
      let { pct, done } = read(first);
      if (!pct && !done && !keys.some((k) => second.includes(k))) ({ pct, done } = read(second));
      if (pct) {
        const p = Math.min(100, Number(pct[1]));
        stageUpdates.push({ stageId: s.id, status: p >= 100 ? "DONE" : "IN_PROGRESS", progress: p });
      } else if (done) stageUpdates.push({ stageId: s.id, status: "DONE", progress: 100 });
    }
  }
  const names = stageUpdates.map((u) => {
    const s = ctx.stages.find((x) => x.id === u.stageId)!;
    return u.status === "DONE" ? `${s.name} is complete` : `${s.name} is ${u.progress}% done`;
  });
  return {
    summary: transcript.length > 220 ? `${transcript.slice(0, 217)}…` : transcript,
    stageUpdates,
    payments: [],
    orders: [],
    visits: [],
    designNotes: [],
    issues: [],
    clientMessage: `Hi ${ctx.project.clientName.split(" ")[0]}, here's an update on ${ctx.project.name}: ${names.length ? names.join(", ") + "." : "work is progressing on site."} We'll keep you posted. — Team Zukhti Home`,
    clarification: null,
  };
}
