import "server-only";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";
import { boqItems, db, orders, projects, vendors } from "@/db";
import type { Role } from "@/db/schema";
import { fxRate } from "./fx";
import { getSettings } from "./settings";
import { can, officeScope } from "./permissions";

const poSchema = z.object({
  projectId: z.string().min(1),
  vendorId: z.string().min(1),
  currency: z.string().min(3).max(3),
  eta: z.string().optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        boqItemId: z.string().nullable(),
        item: z.string().trim().min(1),
        qty: z.number().positive(),
        unit: z.string().trim().min(1),
        unitCost: z.number().min(0),
      }),
    )
    .min(1, "Add at least one line"),
});
export type NewPo = z.infer<typeof poSchema>;

async function nextPoNumber() {
  const prefix = `PO-${new Date().getFullYear()}-`;
  const [{ max }] = await db
    .select({ max: sql<string | null>`max(${orders.poNumber})` })
    .from(orders)
    .where(like(orders.poNumber, `${prefix}%`));
  const last = max ? Number(max.slice(prefix.length)) : 0;
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}

export async function createPurchaseOrder(user: { role: Role; officeId: string | null }, input: NewPo): Promise<{ error: string } | { poNumber: string; projectId: string }> {
  if (!can(user.role, "orders")) return { error: "Not allowed." };
  const parsed = poSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  const scope = officeScope(user);
  const project = await db.query.projects.findFirst({
    where: scope ? and(eq(projects.id, data.projectId), eq(projects.officeId, scope)) : eq(projects.id, data.projectId),
    with: { office: true },
  });
  if (!project) return { error: "Project not found." };
  const vendor = await db.query.vendors.findFirst({ where: eq(vendors.id, data.vendorId) });
  if (!vendor) return { error: "Vendor not found." };
  const boqIds = data.lines.map((l) => l.boqItemId).filter((x): x is string => !!x);
  if (boqIds.length) {
    const found = await db.select({ id: boqItems.id }).from(boqItems).where(and(eq(boqItems.projectId, project.id), inArray(boqItems.id, boqIds)));
    if (found.length !== new Set(boqIds).size) return { error: "Some BOQ lines don't belong to this project." };
  }
  let rate: number;
  try {
    rate = fxRate((await getSettings()).fxRates, data.currency, project.office.currency);
  } catch (e) {
    return { error: (e as Error).message };
  }
  let poNumber = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    poNumber = await nextPoNumber();
    const exists = await db.query.orders.findFirst({ where: eq(orders.poNumber, poNumber) });
    if (!exists) break;
  }
  const eta = data.eta ? new Date(`${data.eta}T10:00:00`) : vendor.leadTimeDays ? new Date(Date.now() + vendor.leadTimeDays * 86400000) : null;
  await db.insert(orders).values(
    data.lines.map((l) => ({
      projectId: project.id,
      item: l.item,
      vendor: vendor.name,
      vendorId: vendor.id,
      poNumber,
      boqItemId: l.boqItemId,
      qty: l.qty,
      unit: l.unit,
      unitCost: l.unitCost,
      currency: data.currency,
      fxRate: rate,
      status: "ORDERED" as const,
      orderedAt: new Date(),
      eta,
      notes: data.notes || null,
    })),
  );
  return { poNumber, projectId: project.id };
}

