import type { Role } from "@/db/schema";

export type Capability =
  | "leads"
  | "projects.view"
  | "projects.edit"
  | "boq"
  | "payments"
  | "orders"
  | "visits"
  | "stages"
  | "design"
  | "rates"
  | "admin"
  | "voice";

const matrix: Record<Role, Capability[]> = {
  OWNER: ["leads", "projects.view", "projects.edit", "boq", "payments", "orders", "visits", "stages", "design", "rates", "admin", "voice"],
  ADMIN: ["leads", "projects.view", "projects.edit", "boq", "payments", "orders", "visits", "stages", "design", "rates", "admin", "voice"],
  DESIGNER: ["leads", "projects.view", "boq", "design", "visits", "rates", "voice"],
  SUPERVISOR: ["projects.view", "stages", "visits", "voice"],
  PROCUREMENT: ["projects.view", "orders", "rates", "voice"],
  ACCOUNTS: ["projects.view", "payments", "voice"],
};

export function can(role: Role, capability: Capability) {
  return matrix[role].includes(capability);
}

export const roleLabels: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  DESIGNER: "Designer",
  SUPERVISOR: "Site supervisor",
  PROCUREMENT: "Procurement",
  ACCOUNTS: "Accounts",
};

/** Whether voice updates from this role go to the client by default (they can flip it per update). */
export const defaultSendToClient: Record<Role, boolean> = {
  OWNER: true,
  ADMIN: true,
  DESIGNER: true,
  SUPERVISOR: true,
  PROCUREMENT: false,
  ACCOUNTS: false,
};

/** Roles that use only the Voice Desk (/desk) and never the full CRM. */
export const DESK_ONLY_ROLES: Role[] = ["SUPERVISOR", "PROCUREMENT", "ACCOUNTS"];
export function isDeskOnly(role: Role) {
  return DESK_ONLY_ROLES.includes(role);
}

/** What each role records on the Voice Desk, shown as guidance on the desk. */
export const deskGuide: Record<Role, { focus: string; example: string }> = {
  OWNER: { focus: "Any update: progress, payments, orders, visits, design decisions", example: "Shah flat: carpentry 70%, client paid 4.5 lakh by NEFT, walkthrough moved to Tuesday 11 am" },
  ADMIN: { focus: "Any update: progress, payments, orders, visits, design decisions", example: "Mehta site visit moved to Tuesday 11 am; sofa delivered" },
  DESIGNER: { focus: "Design approvals and changes, site visits and meetings", example: "Client approved the kitchen laminate, wardrobe handles changed to brass; meeting Friday 4 pm" },
  SUPERVISOR: { focus: "Stage progress, work done today, issues on site, photos", example: "False ceiling done in living and bedroom, electrical 80%, waiting for switches" },
  PROCUREMENT: { focus: "Orders: placed, in production, shipped, customs, delivered, with dates", example: "Shah's sofa shipped from Foshan today, arriving Nhava Sheva on the 18th" },
  ACCOUNTS: { focus: "Payments received against milestones, with reference", example: "Shah paid 4.5 lakh by NEFT for the installation milestone" },
};

/**
 * Office scoping: owners, admins and procurement see every office (China sourcing serves all projects);
 * everyone else sees their own office.
 */
export function officeScope(user: { role: Role; officeId: string | null }) {
  return user.role === "OWNER" || user.role === "ADMIN" || user.role === "PROCUREMENT" ? null : user.officeId;
}
