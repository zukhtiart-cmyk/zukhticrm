import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { callTool } from "./ai-call";
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
  if (/day after tomorrow|parso/.test(t)) return add(2);
  if (/\btoday|aaj\b/.test(t)) return add(0);
  if (/\btomorrow|kal\b/.test(t)) return add(1);
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

// ---------- Rule-based understanding (used when AI isn't available) ----------

const AREAS: Record<string, string> = {
  // Mumbai
  andheri: "Mumbai",
  bandra: "Mumbai",
  juhu: "Mumbai",
  worli: "Mumbai",
  powai: "Mumbai",
  goregaon: "Mumbai",
  malad: "Mumbai",
  borivali: "Mumbai",
  kandivali: "Mumbai",
  santacruz: "Mumbai",
  khar: "Mumbai",
  colaba: "Mumbai",
  "lower parel": "Mumbai",
  parel: "Mumbai",
  dadar: "Mumbai",
  chembur: "Mumbai",
  ghatkopar: "Mumbai",
  mulund: "Mumbai",
  vikhroli: "Mumbai",
  "marine drive": "Mumbai",
  malabar: "Mumbai",
  byculla: "Mumbai",
  wadala: "Mumbai",
  kurla: "Mumbai",
  "vile parle": "Mumbai",
  jogeshwari: "Mumbai",
  versova: "Mumbai",
  lokhandwala: "Mumbai",
  prabhadevi: "Mumbai",
  mahim: "Mumbai",
  sion: "Mumbai",
  bkc: "Mumbai",
  thane: "Thane",
  "navi mumbai": "Navi Mumbai",
  vashi: "Navi Mumbai",
  kharghar: "Navi Mumbai",
  panvel: "Navi Mumbai",
  mumbai: "Mumbai",
  bombay: "Mumbai",
  pune: "Pune",
  lonavala: "Lonavala",
  alibaug: "Alibaug",
  nashik: "Nashik",
  goa: "Goa",
  delhi: "Delhi",
  gurgaon: "Gurugram",
  gurugram: "Gurugram",
  noida: "Noida",
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  hyderabad: "Hyderabad",
  jaipur: "Jaipur",
  ahmedabad: "Ahmedabad",
  surat: "Surat",
  indore: "Indore",
  // UAE
  jumeirah: "Dubai",
  marina: "Dubai",
  "dubai marina": "Dubai",
  downtown: "Dubai",
  "business bay": "Dubai",
  "palm jumeirah": "Dubai",
  jlt: "Dubai",
  jvc: "Dubai",
  "arabian ranches": "Dubai",
  "emirates hills": "Dubai",
  "dubai hills": "Dubai",
  mirdif: "Dubai",
  "al barsha": "Dubai",
  deira: "Dubai",
  dubai: "Dubai",
  "abu dhabi": "Abu Dhabi",
  sharjah: "Sharjah",
  ajman: "Ajman",
};

function findArea(text: string) {
  const t = text.toLowerCase();
  // Longest names first so "navi mumbai" wins over "mumbai".
  const keys = Object.keys(AREAS).sort((a, b) => b.length - a.length);
  const area = keys.find((k) => new RegExp(`\\b${k}\\b`).test(t));
  if (!area) return null;
  const city = AREAS[area];
  const pretty = area
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Bkc", "BKC")
    .replace("Jlt", "JLT")
    .replace("Jvc", "JVC");
  return pretty.toLowerCase() === city.toLowerCase()
    ? city
    : `${pretty}, ${city}`;
}

const STOP = new Set([
  "phone",
  "number",
  "mobile",
  "contact",
  "no",
  "from",
  "in",
  "at",
  "and",
  "who",
  "is",
  "he",
  "she",
  "they",
  "ka",
  "ki",
  "ke",
  "hai",
  "wants",
  "lives",
  "staying",
  "having",
  "has",
  "with",
  "for",
  "the",
  "a",
  "an",
  "client",
  "lead",
  "contractor",
  "new",
  "add",
  "naam",
  "name",
  "called",
  "named",
  "mr",
  "mrs",
  "ms",
  "sir",
  "madam",
  "bhai",
  "ji",
  "it's",
  "its",
  "this",
  "my",
  "came",
  "through",
  "via",
  "looking",
  "need",
  "needs",
  "interested",
  "please",
  "hi",
  "hello",
  "ok",
  "okay",
  "yes",
  "budget",
  "property",
  "about",
  "regarding",
  "lives",
  "living",
  "his",
  "her",
  "their",
  "whose",
  "mobile",
  "cell",
  "whatsapp",
  "email",
  "mail",
]);
const NON_NAMES =
  /^(apartment|villa|flat|bhk|bedroom|office|carpenter|painter|electrician|plumber|instagram|referral|website|whatsapp|mumbai|dubai|budget|rate|rates|upi|tiling|tile|helper|labour|labor)$/i;

function findName(text: string, loose = false) {
  // "name is …" beats "new lead, …" when both are said.
  const m =
    text.match(
      /(?:name is|naam(?: hai)?|named|called|this is)\s*[:,-]?\s+(?:(?:mr|mrs|ms|dr)\.?\s+)?(.+)/i,
    ) ??
    text.match(
      /(?:new lead|new client|new contractor|lead|client|contractor|add)\s*[:,-]?\s+(?:is\s+)?(?:(?:mr|mrs|ms|dr)\.?\s+)?(.+)/i,
    );
  const tail = (m ? m[1] : text).split(/[,.;\n]/)[0];
  const words: string[] = [];
  const tokens = tail.split(/\s+/);
  // Skip a leading title (Mr / Mrs / Dr…).
  let titled = false;
  while (
    tokens.length &&
    /^(mr|mrs|ms|miss|dr|sir|madam|shri|smt)\.?$/i.test(tokens[0])
  ) {
    tokens.shift();
    titled = true;
  }
  // Without "name is…", "new lead…" or a title, only trust a bare name when it's the answer to "what's the name?".
  if (!m && !titled && !loose) return null;
  for (const w of tokens) {
    const clean = w.replace(/[^\p{L}.'&-]/gu, "");
    if (
      !clean ||
      /\d/.test(w) ||
      STOP.has(clean.toLowerCase()) ||
      NON_NAMES.test(clean)
    )
      break;
    words.push(clean.charAt(0).toUpperCase() + clean.slice(1));
    if (words.length === 4) break;
  }
  return words.length ? words.join(" ") : null;
}

function findBudget(text: string) {
  const t = text.toLowerCase().replace(/,/g, "");
  const m = t.match(
    /(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|lakh|l\b|k\b|thousand|aed|dirhams?|million|mn)/,
  );
  if (!m) return /\b(\d+(?:\.\d+)?)\s*(cr|crore)/.test(t) ? null : null;
  const n = Number(m[1]);
  const unit = m[2];
  const aed = /aed|dirham/.test(t) || /dubai|uae/.test(t);
  if (/^cr/.test(unit)) return n >= 1 ? "Luxury (₹1Cr+)" : "Premium (₹40L–1Cr)";
  if (/^la|^l$/.test(unit))
    return n >= 100
      ? "Luxury (₹1Cr+)"
      : n >= 40
        ? "Premium (₹40L–1Cr)"
        : "Mid (₹15–40L)";
  if (unit === "million" || unit === "mn")
    return aed ? "Luxury (AED 400K+)" : `${m[1]} million`;
  if (unit === "k" || unit === "thousand")
    return aed
      ? n >= 400
        ? "Luxury (AED 400K+)"
        : "Mid (AED 150–400K)"
      : `${m[0]}`;
  if (/aed|dirham/.test(unit))
    return n >= 400000 ? "Luxury (AED 400K+)" : "Mid (AED 150–400K)";
  return null;
}

const SYNONYMS: Record<string, [RegExp, string][]> = {
  propertyType: [
    [/\b(\d\s*bhk|bhk|bedroom|flat|apartment|apt)\b/i, "Apartment"],
    [/\b(villa|bungalow|row ?house|independent house)\b/i, "Villa"],
    [/\bpenthouse\b/i, "Penthouse"],
    [/\b(office|workspace|co-?working)\b/i, "Office"],
    [/\b(shop|showroom|store|retail|boutique)\b/i, "Retail"],
    [/\b(hotel|restaurant|cafe|café|resort|bar)\b/i, "Hospitality"],
  ],
  source: [
    [/\b(insta|instagram)\b/i, "Instagram"],
    [/\b(refer|referred|referral|reference|recommended)\b/i, "Referral"],
    [/\b(website|google|online|site)\b/i, "Website"],
    [/\bwhats ?app\b/i, "WhatsApp"],
    [/\bwalk[- ]?in|came to (the )?office\b/i, "Walk-in"],
    [/\barchitect\b/i, "Architect"],
  ],
  trade: [
    [/\b(carpent\w*|wood ?work|furniture)\b/i, "Carpenter"],
    [/\b(paint\w*)\b/i, "Painter"],
    [/\b(electric\w*|wiring)\b/i, "Electrician"],
    [/\b(plumb\w*)\b/i, "Plumber"],
    [/\b(false ceiling|pop|gypsum|ceiling)\b/i, "False ceiling"],
    [/\b(mason|civil|brick ?work)\b/i, "Civil / mason"],
    [/\b(til(e|es|ing)|flooring|marble)\b/i, "Tiling"],
    [/\bpolish\w*\b/i, "Polish"],
    [/\b(fabricat\w*|weld\w*|metal ?work)\b/i, "Fabrication"],
    [/\bclean\w*\b/i, "Cleaning"],
    [/\b(helper|labour|labor|majdoor|mazdoor)\b/i, "Labour / helper"],
  ],
};

function bySynonym(key: string, text: string) {
  return SYNONYMS[key]?.find(([re]) => re.test(text))?.[1] ?? null;
}

function findRates(text: string) {
  const m = text.match(
    /(?:rs\.?|₹|inr|aed)?\s*\d[\d,]*(?:\.\d+)?\s*(?:rs|rupees|₹|aed)?\s*(?:per|\/|a|an)\s*(?:sq\.? ?ft|square (?:feet|foot)|sqft|day|din|rft|running (?:feet|foot)|point|hour|month|piece|nos?)/gi,
  );
  return m ? m.map((x) => x.trim()).join(", ") : null;
}

function findBank(text: string) {
  const parts: string[] = [];
  const upi = text.match(
    /\b[\w.-]{2,}@(?:ok\w+|ybl|paytm|upi|axl|ibl|apl|icici|sbi|hdfcbank|axisbank|kotak|yesbank|\w+)\b/i,
  );
  if (upi && !/\.(com|in|net|org)\b/i.test(upi[0])) parts.push(`UPI ${upi[0]}`);
  const acc = text.match(
    /(?:a\/c|account|acct|ac)\s*(?:no\.?|number)?\s*[:-]?\s*(\d[\d\s]{7,20}\d)/i,
  );
  if (acc) parts.push(`A/c ${acc[1].replace(/\s/g, "")}`);
  const ifsc = text.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/i);
  if (ifsc) parts.push(`IFSC ${ifsc[0].toUpperCase()}`);
  return parts.length ? parts.join(" · ") : null;
}

/** Rule-based extraction used when AI isn't available: understands names, numbers, areas, budgets, trades and dates. */
export function basicExtract(
  kind: IntakeKind,
  text: string,
  current: IntakeFields,
  asking: string | null,
  ctx: IntakeCtx,
): IntakeFields {
  const f: IntakeFields = { ...current };
  const set = (k: string, v: string | null | undefined) => {
    if (!v || (f[k] ?? "").trim()) return;
    const clean = cleanValue(kind, k, v, ctx);
    if (clean) f[k] = clean;
  };

  // An answer to a question goes to that field first (understood by type where possible).
  if (asking) {
    const smart: Record<string, string | null> = {
      name: findName(text, true) ?? text,
      city: findArea(text) ?? text,
      budgetBand: findBudget(text) ?? text,
      propertyType: bySynonym("propertyType", text),
      source: bySynonym("source", text) ?? "Other",
      trade: bySynonym("trade", text) ?? text,
      rateNotes: text,
      bankDetails: findBank(text) ?? text,
      notes: text,
    };
    const v = cleanValue(
      kind,
      asking,
      (asking in smart ? smart[asking] : text) ?? "",
      ctx,
    );
    if (v) f[asking] = v;
  }

  // Phone: the longest run of digits that looks like a number.
  const phone = text
    .match(/\+?\d[\d\s-]{8,16}\d/g)
    ?.map((x) => normalizePhone(x))
    .find(Boolean);
  set("phone", phone ?? null);
  const office = officeFor(text, ctx);
  if (office) set("office", office);

  if (kind === "lead") {
    set("email", text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null);
    if (asking !== "name") set("name", findName(text));
    set("city", findArea(text));
    set("propertyType", bySynonym("propertyType", text));
    set("source", bySynonym("source", text));
    set("budgetBand", findBudget(text));
    const d = /follow|call|visit|meet|baat|milna/i.test(text)
      ? resolveDate(text, ctx.today)
      : null;
    if (d) set("nextFollowUpAt", d);
    if (!f.office && f.city) set("office", officeFor(f.city, ctx));
  } else {
    if (asking !== "name") set("name", findName(text));
    set("trade", bySynonym("trade", text));
    set("rateNotes", findRates(text));
    set("bankDetails", findBank(text));
    if (!f.office) {
      const area = findArea(text);
      if (area) set("office", officeFor(area, ctx));
    }
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
  const out = await callTool<Record<string, string>>(
    client,
    {
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
    messages: [
      {
        role: "user",
        content: `CURRENT values: ${JSON.stringify(current)}\n\nSpeaker said:\n"""${text}"""`,
      },
    ],
    },
    "fill_form",
  );
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
