/** Field definitions for voice intake (shared by server and client). */
import { BUDGET_BANDS, LEAD_SOURCES, PROPERTY_TYPES } from "./defaults";

export type IntakeKind = "lead" | "contractor";
export type Field = {
  key: string;
  label: string;
  question: string;
  required: boolean;
  options?: readonly string[];
  type?: "phone" | "email" | "date" | "office" | "text";
};

const TRADES = [
  "Carpenter",
  "Painter",
  "Electrician",
  "Plumber",
  "False ceiling",
  "Civil / mason",
  "Tiling",
  "Polish",
  "Fabrication",
  "Cleaning",
  "Labour / helper",
  "Other",
] as const;

export const INTAKE_FIELDS: Record<IntakeKind, Field[]> = {
  lead: [
    {
      key: "name",
      label: "Client name",
      question: "What is the client's name?",
      required: true,
    },
    {
      key: "phone",
      label: "Phone",
      question: "What is their phone number?",
      required: true,
      type: "phone",
    },
    {
      key: "city",
      label: "City / area",
      question: "Which city and area is the property in?",
      required: true,
    },
    {
      key: "propertyType",
      label: "Property type",
      question:
        "What type of property is it — apartment, villa, penthouse, office?",
      required: true,
      options: PROPERTY_TYPES,
    },
    {
      key: "budgetBand",
      label: "Budget",
      question: "What is their budget?",
      required: true,
      options: BUDGET_BANDS,
    },
    {
      key: "source",
      label: "Source",
      question:
        "How did they find us — Instagram, referral, website, walk-in, architect?",
      required: true,
      options: LEAD_SOURCES,
    },
    {
      key: "nextFollowUpAt",
      label: "Next follow-up",
      question: "When should we follow up with them next?",
      required: true,
      type: "date",
    },
    {
      key: "office",
      label: "Office",
      question: "Which office will handle this — Mumbai, Dubai or China?",
      required: true,
      type: "office",
    },
    {
      key: "email",
      label: "Email",
      question: "Do they have an email address? Say 'no' to skip.",
      required: false,
      type: "email",
    },
    {
      key: "notes",
      label: "Requirements / notes",
      question: "Any requirements or notes — rooms, style, timeline?",
      required: true,
    },
  ],
  contractor: [
    {
      key: "name",
      label: "Name / firm",
      question: "What is the contractor's name or firm name?",
      required: true,
    },
    {
      key: "trade",
      label: "Trade",
      question:
        "What is their trade — carpenter, painter, electrician, plumber, or helper?",
      required: true,
      options: TRADES,
    },
    {
      key: "phone",
      label: "Phone",
      question: "What is their phone number?",
      required: true,
      type: "phone",
    },
    {
      key: "rateNotes",
      label: "Rates",
      question:
        "What are their rates? For example, per square foot or per day.",
      required: true,
    },
    {
      key: "bankDetails",
      label: "Bank / UPI",
      question:
        "What are their payment details — UPI ID or bank account and IFSC?",
      required: true,
    },
    {
      key: "office",
      label: "Office",
      question: "Which office will they work for — Mumbai, Dubai or China?",
      required: true,
      type: "office",
    },
  ],
};

export type IntakeFields = Record<string, string>;

/** Values meaning "none" for optional fields, so we don't keep asking. */
export const SKIP = "—";

export function missingFields(kind: IntakeKind, f: IntakeFields) {
  return INTAKE_FIELDS[kind].filter((d) => !(f[d.key] ?? "").trim());
}
