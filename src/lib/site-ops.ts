import "server-only";
import { and, eq, isNull, like, ne, or } from "drizzle-orm";
import { contractorBills, contractors, db, projects, siteExpenses, workOrders } from "@/db";
import { officeScope } from "./permissions";
import type { Role } from "@/db/schema";

type U = { role: Role; officeId: string | null };

/** Projects (not handed over unless asked) the user may work on. */
export function scopedProjects(user: U, includeHandedOver = false) {
  const scope = officeScope(user);
  return db.query.projects.findMany({
    where: and(scope ? eq(projects.officeId, scope) : undefined, includeHandedOver ? undefined : ne(projects.status, "HANDED_OVER")),
    with: { office: true, client: true },
    orderBy: (p, { desc }) => desc(p.createdAt),
  });
}

/** Project the user may access, or null. */
export async function scopedProject(user: U, projectId: string) {
  const scope = officeScope(user);
  return (
    (await db.query.projects.findFirst({
      where: scope ? and(eq(projects.id, projectId), eq(projects.officeId, scope)) : eq(projects.id, projectId),
      with: { office: true, client: true, stages: true },
    })) ?? null
  );
}

/** WO-2026-0001, numbered per year. */
export async function nextWorkOrderNumber() {
  const prefix = `WO-${new Date().getFullYear()}-`;
  const rows = await db.select({ n: workOrders.number }).from(workOrders).where(like(workOrders.number, `${prefix}%`));
  const max = rows.reduce((m, r) => Math.max(m, Number(r.n.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Optional uploaded image/PDF from a form field, or null. */
export function formFile(form: FormData, name: string, max = 15 * 1024 * 1024) {
  const f = form.get(name);
  if (!(f instanceof File) || f.size === 0) return { file: null as File | null };
  if (f.size > max) return { error: "File is too large (max 15 MB)" };
  if (!f.type.startsWith("image/") && f.type !== "application/pdf") return { error: "Attach a photo or PDF" };
  return { file: f };
}

/** Contractor visible to this user (their office, or shared across offices). */
export async function findContractor(user: U, id: string) {
  const scope = officeScope(user);
  return (
    (await db.query.contractors.findFirst({
      where: scope ? and(eq(contractors.id, id), or(eq(contractors.officeId, scope), isNull(contractors.officeId))) : eq(contractors.id, id),
    })) ?? null
  );
}

/** Contractors visible to this user. */
export function scopedContractors(user: U) {
  const scope = officeScope(user);
  return db.query.contractors.findMany({
    where: scope ? or(eq(contractors.officeId, scope), isNull(contractors.officeId)) : undefined,
    with: { office: true, workOrders: { with: { bills: true, project: true } } },
    orderBy: (c, { asc }) => [asc(c.trade), asc(c.name)],
  });
}

/** Expenses + contractor bills waiting for this approver (their office scope). */
export async function pendingApprovals(user: U) {
  const scope = officeScope(user);
  const exp = await db
    .select({ id: siteExpenses.id })
    .from(siteExpenses)
    .innerJoin(projects, eq(projects.id, siteExpenses.projectId))
    .where(and(eq(siteExpenses.status, "PENDING"), scope ? eq(projects.officeId, scope) : undefined));
  const bills = await db
    .select({ id: contractorBills.id })
    .from(contractorBills)
    .innerJoin(workOrders, eq(workOrders.id, contractorBills.workOrderId))
    .innerJoin(projects, eq(projects.id, workOrders.projectId))
    .where(and(eq(contractorBills.status, "PENDING"), scope ? eq(projects.officeId, scope) : undefined));
  return exp.length + bills.length;
}
