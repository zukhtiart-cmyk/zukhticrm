import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  INTAKE_FIELDS,
  SKIP,
  missingFields,
  type IntakeFields,
  type IntakeKind,
} from "./intake-fields";

export type IntakeCtx = {
  today: string;
  offices: { id: string; name: string; city: string; currency: string }[];
  defaultOfficeId: string | null;
  speaker: string;
};

/** +91 for 10-digit Indian mobiles, +971 for UAE 05x numbers; otherwise keep what was said. */
export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const d = digits.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;
  if (/^0?5\d{8}$/.test(d)) return `+971${d.replace(/^0/, "")}`;
  if (/^(91|971|86)\d{8,12}$/.test(d)) return `+${d}`;
  if (/^0\d{10}$/.test(d) && /^0[6-9]/.test(d)) return `+91${d.slice(1)}`;
  return d.length >= 8 ? d : "";
}

function pickOption(value: string, options: readonly string[]) {
  const v = value.toLowerCase();
  return (
    options.find((o) => o.toLowerCase() === v) ??
    options.find((o) => v.includes(o.toLowerCase().split(/[ /(]/)[0])) ??
    null
  );
}

function officeFor(text: string, ctx: IntakeCtx) {
  const t = text.toLowerCase();
  const hit = ctx.offices.find(
    (o) =>
      t.includes(o.city.toLowerCase()) ||
      t.includes(o.name.toLowerCase().split(" ")[0]),
  );
  if (hit) return hit.id;
  if (/\b(dubai|abu dhabi|sharjah|uae)\b/.test(t))
    return ctx.offices.find((o) => o.currency === "AED")?.id ?? null;
  if (/\b(china|foshan|guangzhou|shenzhen)\b/.test(t))
    return ctx.offices.find((o) => o.currency === "CNY")?.id ?? null;
  if (
    /\b(mumbai|thane|navi mumbai|pune|bandra|andheri|powai|juhu|worli)\b/.test(
      t,
    )
  )
    return ctx.offices.find((o) => o.currency === "INR")?.id ?? null;
  return null;
}

function resolveDate(text: string, today: string) {
  const t = text.toLowerCase();
  const base = new Date(`${today}T12:00:00`);
  const add = (n: number) =>
    new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10);
  if (/\btoday|aaj\b/.test(t)) return add(0);
  if (/\btomorrow|kal\b/.test(t)) return add(1);
  if (/day after|parso/.test(t)) return add(2);
  const inDays = t.match(/in (\d+) days?|(\d+) din/);
  if (inDays) return add(Number(inDays[1] ?? inDays[2]));
  if (/next week|agle hafte/.test(t)) return add(7);
  const iso = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  if (iso) return iso[0];
  const dm = t.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/,
  );
  if (dm) {
    const m = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(dm[2]);
    const d = new Date(base.getFullYear(), m, Number(dm[1]), 12);
    if (d < base) d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Clean one value for its field, or "" if it doesn't fit. */
function cleanValue(
  kind: IntakeKind,
  key: string,
  raw: string,
  ctx: IntakeCtx,
) {
  const def = INTAKE_FIELDS[kind].find((d) => d.key === key);
  const value = raw.trim();
  if (!def || !value) return "";
  if (
    !def.required &&
    /^(no|none|nahi|skip|na|n\/a|nothing|—)\.?$/i.test(value)
  )
    return SKIP;
  switch (def.type) {
    case "phone":
      return normalizePhone(value);
    case "email":
      return value.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase() ?? "";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value
        : (resolveDate(value, ctx.today) ?? "");
    case "office":
      return ctx.offices.some((o) => o.id === value)
        ? value
        : (officeFor(value, ctx) ?? "");
  }
  if (def.options)
    return (
      pickOption(value, def.options) ??
      (key === "budgetBand"
        ? value.slice(0, 60)
        : def.options.includes("Other")
          ? "Other"
          : "")
    );
  return value.slice(0, 500);
}

/** Rule-based extraction used when AI isn't available: phone, email and keywords, plus the answer to the last question. */
export function basicExtract(
  kind: IntakeKind,
  text: string,
  current: IntakeFields,
  asking: string | null,
  ctx: IntakeCtx,
): IntakeFields {
  const f: IntakeFields = { ...current };
  const set = (k: string, v: string | null | undefined) => {
    if (v && !(f[k] ?? "").trim()) f[k] = cleanValue(kind, k, v, ctx);
  };
  if (asking) {
    // The whole answer belongs to the field we just asked about.
    const v = cleanValue(kind, asking, text, ctx);
    if (v) f[asking] = v;
  }
  set("phone", text.match(/(\+?\d[\d\s-]{8,16}\d)/)?.[1] ?? null);
  if (kind === "lead")
    set("email", text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null);
  set(
    "name",
    text.match(
      /(?:name is|naam|called|named)\s+([A-Z][\w.]*(?:\s+[A-Z][\w.]*){0,3})/i,
    )?.[1] ?? null,
  );
  for (const def of INTAKE_FIELDS[kind].filter((d) => d.options)) {
    const hit = def.options!.find((o) =>
      new RegExp(`\\b${o.toLowerCase().split(/[ /(]/)[0]}`, "i").test(text),
    );
    if (hit && def.key !== "budgetBand") set(def.key, hit);
  }
  const office = officeFor(text, ctx);
  if (office) set("office", office);
  if (kind === "lead") {
    const d = /follow|call|visit|meet/i.test(text)
      ? resolveDate(text, ctx.today)
      : null;
    if (d) set("nextFollowUpAt", d);
  }
  return f;
}

const tool = (kind: IntakeKind) => ({
  name: "fill_form",
  description: `Fill the new ${kind} form from what the speaker said.`,
  input_schema: {
    type: "object" as const,
    properties: Object.fromEntries(
      INTAKE_FIELDS[kind].map((d) => [
        d.key,
        {
          type: "string",
          description: `${d.label}.${d.options ? ` One of: ${d.options.join(" | ")}${d.key === "budgetBand" ? " (or the amount as spoken if none fits)" : ""}.` : ""}${d.type === "date" ? " YYYY-MM-DD." : ""}${d.type === "phone" ? " With country code, e.g. +919820012345." : ""}${d.type === "office" ? " Office id from the list." : ""} Empty string if not said.${!d.required ? ` Use "${SKIP}" if the speaker says there is none.` : ""}`,
        },
      ]),
    ),
    required: INTAKE_FIELDS[kind].map((d) => d.key),
  },
});

export async function aiExtract(
  kind: IntakeKind,
  text: string,
  current: IntakeFields,
  asking: string | null,
  ctx: IntakeCtx,
): Promise<IntakeFields> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 800,
    system: `You fill a ${kind === "lead" ? "new client lead" : "new contractor"} form for Zukhti Home, a turnkey interior design company (offices: ${ctx.offices.map((o) => `${o.id} = ${o.name}, ${o.city}`).join("; ")}).
The speaker (${ctx.speaker}) talks in English, Hindi or Hinglish. Today is ${ctx.today}.
Rules:
- Start from the CURRENT values. Keep them unless the speaker clearly corrects them. Fill empty ones only from what was actually said — never guess names, numbers or rates.
- ${asking ? `The speaker is answering the question about "${asking}"; put the answer there.` : "Extract every field mentioned."}
- Indian 10-digit mobiles get +91, UAE 05x numbers get +971.
- Choose the office from the property/contractor location if clear.
- Resolve relative dates ("kal", "next Monday", "in 3 days") from today.
- Write notes and rates concisely in English.
Always call fill_form with ALL fields (empty string where unknown).`,
    tools: [tool(kind)],
    tool_choice: { type: "tool", name: "fill_form" },
    messages: [
      {
        role: "user",
        content: `CURRENT values: ${JSON.stringify(current)}\n\nSpeaker said:\n"""${text}"""`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use")
    throw new Error("AI returned nothing");
  const out = block.input as Record<string, string>;
  const merged: IntakeFields = { ...current };
  for (const d of INTAKE_FIELDS[kind]) {
    const v = cleanValue(kind, d.key, String(out[d.key] ?? ""), ctx);
    if (v) merged[d.key] = v;
  }
  return merged;
}

export function nextQuestion(kind: IntakeKind, f: IntakeFields) {
  const missing = missingFields(kind, f);
  const next = missing[0] ?? null;
  return {
    missing: missing.map((m) => ({ key: m.key, label: m.label })),
    asking: next?.key ?? null,
    question: next?.question ?? null,
  };
}
