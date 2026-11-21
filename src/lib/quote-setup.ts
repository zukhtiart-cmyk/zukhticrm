/**
 * How a project's quotation is presented: price style, GST, a round-figure total, room sizes and order,
 * and the notes that follow the total (material rates, brands & allowances, exclusions, packages).
 * Shared by the server and the browser.
 */

export const PRICE_MODES = ["combined", "rooms", "itemised"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  combined: "One total only",
  rooms: "Total per room",
  itemised: "Price for every item",
};
export const PRICE_MODE_HINTS: Record<PriceMode, string> = {
  combined: "No prices next to items — you write the total. Tick “show price” on any item (e.g. the sofa) to print its price.",
  rooms: "A total under each room — type it, or let the items add up.",
  itemised: "Qty, rate and amount for every item.",
};
export const TAX_MODES = ["add", "included", "none"] as const;
export type TaxMode = (typeof TAX_MODES)[number];
export const TAX_MODE_LABELS: Record<TaxMode, string> = {
  add: "Add GST on top",
  included: "Prices include GST",
  none: "Don't show GST",
};

export type QuoteNotes = {
  /** Material rates (e.g. "MR Ply: Rs 75/sq ft"). */
  rates: string[];
  /** The line under the rates, e.g. about charges over budget. */
  budgetNote: string;
  /** Brands, quality and allowances. */
  brands: string[];
  exclusions: string[];
  /** "Other suggested packages". */
  packages: string[];
  /** Validity, measurement, other terms. */
  terms: string;
};

export type QuoteSetup = {
  /** e.g. "Interior work of 2BHK flat, Dombivli" */
  title: string;
  mode: PriceMode;
  taxMode: TaxMode;
  /** A round figure to quote instead of the calculated sum (before GST when GST is added on top). */
  totalOverride: number | null;
  /** Room → size shown in its heading, e.g. 17'2" x 27'4". */
  roomSizes: Record<string, string>;
  /** Room totals typed by hand (Total per room); rooms without one add up their items. */
  roomTotals: Record<string, number>;
  roomOrder: string[];
  notes: QuoteNotes;
};

export const DEFAULT_NOTES: QuoteNotes = {
  rates: [
    "MR Ply: Rs. 75/sq ft",
    "Marine Ply: Rs. 90/sq ft — if Marine ply is used for the whole flat, the extra amount will be added to the total above.",
    "Inside laminate (fabric texture): Rs. 500/sheet",
    "Outside laminate: Rs. 2,000/sheet",
    "Acrylic (kitchen, matt): Rs. 3,000/sheet",
    "Handles (8 inch / 10 inch): Rs. 700/pc",
    "Knobs: Rs. 250/pc",
    "Mortise handles will be provided by the client.",
  ],
  budgetNote: "Any additional charges over the provided budget will be paid by the client.",
  brands: [
    "Polycab wires will be used for electrical work.",
    "Only Indian electrical fittings with a 24-month warranty will be used. Whole flat panel lights, strip lights & fans: Rs. 1,00,000 (Roma / Anchor switches).",
    "Ready-made furniture provided by us: 3-seater sofa set, centre table (up to Rs. 65,000).",
    "Walls will be painted using Asian Paints Royale.",
    "All flat hardware cost: Rs. 1,00,000.",
  ],
  exclusions: ["Fancy lights such as hanging lights, wall lights, chandeliers and wall washers are not included in the above quotation."],
  packages: [
    "Ready-made furnishings: curtains / blinds for the entire house with American channel, mattresses.",
    "Appliances: geysers, chimney, hob.",
    "Interior styling: consultation on styling and decorating your house, and the best styling material (wall art, paintings, artefacts, indoor plants) within your budget.",
  ],
  terms: "Valid for 30 days. Final quantities are measured on site. Prices include supply and installation unless stated.",
};

export function defaultSetup(notes: QuoteNotes = DEFAULT_NOTES): QuoteSetup {
  return { title: "", mode: "combined", taxMode: "add", totalOverride: null, roomSizes: {}, roomTotals: {}, roomOrder: [], notes };
}

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
const list = (v: unknown, fallback: string[]) => (Array.isArray(v) ? v.map((x) => str(x, 600).trim()).filter(Boolean).slice(0, 40) : fallback);

export function normaliseNotes(raw: unknown, fallback: QuoteNotes = DEFAULT_NOTES): QuoteNotes {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return fallback;
  return {
    rates: list(o.rates, fallback.rates),
    budgetNote: typeof o.budgetNote === "string" ? str(o.budgetNote, 600) : fallback.budgetNote,
    brands: list(o.brands, fallback.brands),
    exclusions: list(o.exclusions, fallback.exclusions),
    packages: list(o.packages, fallback.packages),
    terms: typeof o.terms === "string" ? str(o.terms, 1500) : fallback.terms,
  };
}

export function normaliseSetup(raw: unknown, defaults: QuoteNotes = DEFAULT_NOTES): QuoteSetup {
  const o = (raw ?? {}) as Record<string, unknown>;
  const base = defaultSetup(defaults);
  const sizes: Record<string, string> = {};
  if (o.roomSizes && typeof o.roomSizes === "object") for (const [k, v] of Object.entries(o.roomSizes as Record<string, unknown>).slice(0, 80)) if (typeof v === "string" && v.trim()) sizes[k.slice(0, 60)] = v.trim().slice(0, 40);
  const roomTotals: Record<string, number> = {};
  if (o.roomTotals && typeof o.roomTotals === "object")
    for (const [k, v] of Object.entries(o.roomTotals as Record<string, unknown>).slice(0, 80)) {
      const n = Number(v);
      if (v !== null && v !== "" && Number.isFinite(n) && n > 0) roomTotals[k.slice(0, 60)] = Math.round(n * 100) / 100;
    }
  const ov = Number(o.totalOverride);
  return {
    title: str(o.title, 200),
    mode: (PRICE_MODES as readonly string[]).includes(String(o.mode)) ? (o.mode as PriceMode) : base.mode,
    taxMode: (TAX_MODES as readonly string[]).includes(String(o.taxMode)) ? (o.taxMode as TaxMode) : base.taxMode,
    totalOverride: o.totalOverride !== null && o.totalOverride !== "" && Number.isFinite(ov) && ov > 0 ? Math.round(ov * 100) / 100 : null,
    roomSizes: sizes,
    roomTotals,
    roomOrder: Array.isArray(o.roomOrder) ? o.roomOrder.map((x) => str(x, 60)).filter(Boolean).slice(0, 80) : [],
    notes: normaliseNotes(o.notes, defaults),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What the items come to: the plain sum, each room's total (typed or added up), and the base the quote
 * starts from (room totals in "Total per room", otherwise the sum).
 */
export function quoteBase(items: { room: string; qty: number; unitPrice: number }[], setup: Pick<QuoteSetup, "mode" | "roomTotals">) {
  const rooms: Record<string, { sum: number; total: number; typed: boolean }> = {};
  for (const i of items) {
    const r = (rooms[i.room] ??= { sum: 0, total: 0, typed: false });
    r.sum += i.qty * i.unitPrice;
  }
  for (const [name, r] of Object.entries(rooms)) {
    const typed = setup.mode === "rooms" ? setup.roomTotals[name] : undefined;
    r.sum = r2(r.sum);
    r.total = typed ?? r.sum;
    r.typed = typed !== undefined;
  }
  const sum = r2(Object.values(rooms).reduce((a, r) => a + r.sum, 0));
  const base = r2(Object.values(rooms).reduce((a, r) => a + r.total, 0));
  return { sum, rooms, base };
}

/**
 * The quote's money: the calculated sum, the amount quoted (a round-figure override if set), GST and the total.
 * - add: total = amount + GST
 * - included: total = amount; GST shown as "included" (worked back out)
 * - none: total = amount; no GST line
 */
export function quoteTotals(sum: number, setup: Pick<QuoteSetup, "taxMode" | "totalOverride">, taxRate: number) {
  const amount = r2(setup.totalOverride ?? sum);
  if (setup.taxMode === "add") {
    const tax = r2((amount * taxRate) / 100);
    return { sum: r2(sum), amount, subtotal: amount, tax, total: r2(amount + tax) };
  }
  if (setup.taxMode === "included") {
    const subtotal = r2(amount / (1 + taxRate / 100));
    return { sum: r2(sum), amount, subtotal, tax: r2(amount - subtotal), total: amount };
  }
  return { sum: r2(sum), amount, subtotal: amount, tax: 0, total: amount };
}

/** A, B, C … Z, AA, AB … */
export function sectionLetter(i: number) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function twoDigits(n: number) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}
function threeDigits(n: number) {
  const h = Math.floor(n / 100),
    r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

/** Indian style: 1359000 → "Thirteen Lakh Fifty-Nine Thousand". */
export function amountInWordsIndian(value: number) {
  let n = Math.round(Math.abs(value));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 100 ? amountInWordsIndian(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

/** International style for other currencies: 1250000 → "One Million Two Hundred Fifty Thousand". */
export function amountInWords(value: number, currency: string) {
  if (currency === "INR") return amountInWordsIndian(value);
  let n = Math.round(Math.abs(value));
  if (n === 0) return "Zero";
  const scales: [number, string][] = [
    [1e9, "Billion"],
    [1e6, "Million"],
    [1e3, "Thousand"],
  ];
  const parts: string[] = [];
  for (const [v, name] of scales) {
    if (n >= v) {
      parts.push(`${threeDigits(Math.floor(n / v))} ${name}`);
      n %= v;
    }
  }
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

/** Metres → 12'2" style. */
export function feetInches(m: number) {
  const totalIn = Math.round(m / 0.0254);
  const ft = Math.floor(totalIn / 12),
    inch = totalIn % 12;
  return inch ? `${ft}'${inch}"` : `${ft}'`;
}
