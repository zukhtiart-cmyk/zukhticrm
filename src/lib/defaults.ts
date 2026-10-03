/** Standard turnkey stages, created for every new project. Editable per project afterwards. */
export const DEFAULT_STAGES = [
  "Design",
  "Civil & demolition",
  "Electrical & plumbing",
  "False ceiling",
  "Carpentry",
  "Painting & finishes",
  "Installation",
  "Handover",
];

/** Default payment schedule; the due stage is matched by name. */
export const DEFAULT_MILESTONES = [
  { label: "Booking advance", percent: 10, stage: null },
  { label: "Design sign-off", percent: 15, stage: "Design" },
  { label: "Carpentry start", percent: 35, stage: "Carpentry" },
  { label: "Installation", percent: 30, stage: "Installation" },
  { label: "Handover", percent: 10, stage: "Handover" },
];

export const LEAD_SOURCES = ["Website", "Instagram", "WhatsApp", "Referral", "Walk-in", "Architect", "Other"];
export const BUDGET_BANDS = ["Mid (₹15–40L)", "Premium (₹40L–1Cr)", "Luxury (₹1Cr+)", "Mid (AED 150–400K)", "Luxury (AED 400K+)"];
export const PROPERTY_TYPES = ["Apartment", "Villa", "Penthouse", "Office", "Retail", "Hospitality"];
