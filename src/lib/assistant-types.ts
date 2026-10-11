/** Shared between the assistant API and the floating assistant panel. */

export type ActionType =
  | "payment"
  | "expense"
  | "snag"
  | "project_update"
  | "new_lead"
  | "new_contractor"
  | "open"
  | "bill"
  | "measurements"
  | "question";

export type AssistantAction = {
  type: ActionType;
  projectId?: string | null;
  contractorId?: string | null;
  /** Contractor running bills: the work order it's billed against. */
  workOrderId?: string | null;
  /** Answer to a question (filled by the server). */
  answer?: string | null;
  /** Name as spoken when no matching contractor was found. */
  contractorName?: string | null;
  amount?: number | null;
  mode?: string | null;
  kind?: "ADVANCE" | "WAGES" | "BILL" | "OTHER" | null;
  billId?: string | null;
  billLabel?: string | null;
  reference?: string | null;
  note?: string | null;
  category?: string | null;
  description?: string | null;
  paidTo?: string | null;
  room?: string | null;
  /** Snags: the person said there's no photo. */
  photoSkipped?: boolean;
  /** Hand-offs: what was said, passed to the matching screen. */
  text?: string | null;
  href?: string | null;
};

export type Missing = {
  index: number;
  field: string;
  label: string;
  question: string;
  optional?: boolean;
};

export type AssistantReply = {
  reply: string;
  actions: AssistantAction[];
  missing: Missing[];
  asking: { index: number; field: string } | null;
  heard: string;
  notice?: string;
  /** What the speaker wants done with the cards right now: "save" them, "cancel" them, or nothing. */
  intent?: "save" | "cancel" | null;
  /** Everything needed is filled and Zuki has read it back — a "yes" will save it. */
  readyToSave?: boolean;
};

/** One line of the running conversation, so Zuki understands "same for Mehta" or "change it to 6000". */
export type HistoryTurn = { who: "me" | "zuki"; text: string };

/** Short spoken confirmations, in English, Hindi and Hinglish. */
export const YES_RE =
  /^\s*(yes|y|yeah|yep|yup|sure|haan|haa|ha|han|hanji|haanji|ji|ok|okay|okk|save|save it|save kar|save karo|confirm|done|go ahead|theek hai|thik hai|theek|sahi hai|bilkul|kar do|kardo|👍)\b/i;
export const NO_RE =
  /^\s*(no|nope|nahi|nahin|na|cancel|stop|reset|clear|discard|chhodo|chodo|rehne do|rahne do|mat karo)\b/i;
/** A reply is a plain yes/no only when it's short — "yes, and also add 2000 for Mehta" is a new instruction. */
export const isShortYes = (t: string) =>
  YES_RE.test(t) && t.trim().split(/\s+/).length <= 6 && !/\d/.test(t);
export const isShortNo = (t: string) =>
  NO_RE.test(t) && t.trim().split(/\s+/).length <= 5 && !/\d/.test(t);

export type AssistantContext = {
  projects: { id: string; name: string; client: string; currency: string }[];
  contractors: { id: string; name: string; trade: string }[];
  workOrders: {
    id: string;
    number: string;
    title: string;
    contractorId: string;
    projectId: string;
  }[];
  allowed: ActionType[];
};

export const PAYMENT_MODES = [
  "UPI",
  "Bank transfer",
  "Cash",
  "Cheque",
] as const;
export const EXPENSE_CATEGORIES = [
  "Material",
  "Labour",
  "Transport",
  "Tools & consumables",
  "Food & site",
  "Other",
] as const;

export const ACTION_LABEL: Record<ActionType, string> = {
  payment: "Payment to contractor / labour",
  expense: "Site expense",
  snag: "Snag",
  project_update: "Project update",
  new_lead: "New lead",
  new_contractor: "New contractor",
  open: "Open",
  bill: "Contractor running bill",
  measurements: "Site measurements → AI BOQ",
  question: "Question",
};

/** Actions that open the matching screen with what was said, instead of saving directly here. */
export const HANDOFF: ActionType[] = [
  "project_update",
  "new_lead",
  "new_contractor",
  "open",
  "measurements",
  "question",
];

export function handoffHref(a: AssistantAction) {
  const say = a.text ? `&say=${encodeURIComponent(a.text.slice(0, 1500))}` : "";
  if (a.type === "project_update")
    return `/desk?project=${a.projectId ?? ""}${say}`;
  if (a.type === "new_lead") return `/desk?mode=lead${say}`;
  if (a.type === "new_contractor") return `/desk?mode=contractor${say}`;
  if (a.type === "measurements")
    return `/projects/${a.projectId ?? ""}/boq?brief=${encodeURIComponent((a.text ?? "").slice(0, 1500))}`;
  return a.href ?? "/";
}
