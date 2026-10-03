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

/** Office scoping: owners and admins see every office; everyone else sees their own office. */
export function officeScope(user: { role: Role; officeId: string | null }) {
  return user.role === "OWNER" || user.role === "ADMIN" ? null : user.officeId;
}
