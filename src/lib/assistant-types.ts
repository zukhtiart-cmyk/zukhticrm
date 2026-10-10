/** Shared between the assistant API and the floating assistant panel. */

export type ActionType =
  | "payment"
  | "expense"
  | "snag"
  | "project_update"
  | "new_lead"
  | "new_contractor"
  | "open";

export type AssistantAction = {
  type: ActionType;
  projectId?: string | null;
  contractorId?: string | null;
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
};

export type AssistantContext = {
  projects: { id: string; name: string; client: string; currency: string }[];
  contractors: { id: string; name: string; trade: string }[];
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
};

/** Actions that open the matching screen with what was said, instead of saving directly here. */
export const HANDOFF: ActionType[] = [
  "project_update",
  "new_lead",
  "new_contractor",
  "open",
];

export function handoffHref(a: AssistantAction) {
  const say = a.text ? `&say=${encodeURIComponent(a.text.slice(0, 1500))}` : "";
  if (a.type === "project_update")
    return `/desk?project=${a.projectId ?? ""}${say}`;
  if (a.type === "new_lead") return `/desk?mode=lead${say}`;
  if (a.type === "new_contractor") return `/desk?mode=contractor${say}`;
  return a.href ?? "/";
}
