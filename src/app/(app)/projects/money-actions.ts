"use server";

import { and, desc, eq, like, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { boqItems, db, milestones, quotes, quoteStatusEnum, rateItems, type QuoteLine } from "@/db";
import { round2 } from "@/lib/format";
import { syncMilestoneAmounts } from "@/lib/projects";
import { z } from "zod";
import { assertProjectAccess } from "./data";

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const done = (id: string) => revalidatePath(`/projects/${id}`, "layout");

// ---------- BOQ ----------

export async function addBoqItem(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const rateId = String(form.get("rateItemId") ?? "");
  const rate = rateId ? await db.query.rateItems.findFirst({ where: eq(rateItems.id, rateId) }) : null;
  const description = String(form.get("description") ?? "").trim() || rate?.name;
  if (!description) return;
  await db.insert(boqItems).values({
    projectId: project.id,
    room: String(form.get("room") ?? "").trim() || "General",
    description,
    unit: String(form.get("unit") ?? "").trim() || rate?.unit || "nos",
    qty: num(form.get("qty")) || 1,
    unitCost: form.get("unitCost") ? num(form.get("unitCost")) : (rate?.cost ?? 0),
    unitPrice: form.get("unitPrice") ? num(form.get("unitPrice")) : (rate?.price ?? 0),
    rateItemId: rate?.id ?? null,
  });
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  done(project.id);
}

export async function updateBoqItem(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  await db
    .update(boqItems)
    .set({
      room: String(form.get("room") ?? "").trim() || "General",
      description: String(form.get("description") ?? "").trim(),
      unit: String(form.get("unit") ?? "").trim(),
      qty: num(form.get("qty")),
      unitCost: num(form.get("unitCost")),
      unitPrice: num(form.get("unitPrice")),
    })
    .where(and(eq(boqItems.id, String(form.get("id"))), eq(boqItems.projectId, project.id)));
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  done(project.id);
}

export async function deleteBoqItem(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  await db.delete(boqItems).where(and(eq(boqItems.id, String(form.get("id"))), eq(boqItems.projectId, project.id)));
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  done(project.id);
}

// ---------- Quotes ----------

/** Freezes the current BOQ (sell prices only) as the next quote version. */
export async function createQuote(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const items = await db.select().from(boqItems).where(eq(boqItems.projectId, project.id));
  if (!items.length) return;
  const lines: QuoteLine[] = items
    .sort((a, b) => a.room.localeCompare(b.room))
    .map((i) => ({ room: i.room, description: i.description, unit: i.unit, qty: i.qty, unitPrice: i.unitPrice, amount: round2(i.qty * i.unitPrice) }));
  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0));
  const tax = round2((subtotal * project.office.taxRate) / 100);
  const last = await db.query.quotes.findFirst({ where: eq(quotes.projectId, project.id), orderBy: desc(quotes.version) });
  const [quote] = await db
    .insert(quotes)
    .values({
      projectId: project.id,
      version: (last?.version ?? 0) + 1,
      currency: project.office.currency,
      taxLabel: project.office.taxLabel,
      taxRate: project.office.taxRate,
      subtotal,
      tax,
      total: round2(subtotal + tax),
      lines,
    })
    .returning();
  redirect(`/projects/${project.id}/quote/${quote.id}`);
}

export async function setQuoteStatus(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const status = z.enum(quoteStatusEnum.enumValues).parse(form.get("status"));
  await db.update(quotes).set({ status }).where(and(eq(quotes.id, String(form.get("id"))), eq(quotes.projectId, project.id)));
  done(project.id);
}

// ---------- Payments ----------

export async function updateMilestone(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "payments");
  await db
    .update(milestones)
    .set({
      label: String(form.get("label") ?? "").trim(),
      percent: num(form.get("percent")),
      dueStageId: String(form.get("dueStageId") ?? "") || null,
    })
    .where(and(eq(milestones.id, String(form.get("id"))), eq(milestones.projectId, project.id)));
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  done(project.id);
}

export async function addMilestone(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "payments");
  const label = String(form.get("label") ?? "").trim();
  if (!label) return;
  const existing = await db.select().from(milestones).where(eq(milestones.projectId, project.id));
  await db.insert(milestones).values({ projectId: project.id, label, percent: num(form.get("percent")), amount: 0, sortOrder: existing.length });
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  done(project.id);
}

export async function recordPayment(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "payments");
  const id = String(form.get("id"));
  const m = await db.query.milestones.findFirst({ where: and(eq(milestones.id, id), eq(milestones.projectId, project.id)) });
  if (!m) return;
  const paidAt = form.get("paidAt") ? new Date(`${form.get("paidAt")}T10:00:00`) : new Date();
  await db
    .update(milestones)
    .set({ status: "PAID", paidAmount: num(form.get("paidAmount")) || m.amount, paidAt, reference: String(form.get("reference") ?? "") || null })
    .where(eq(milestones.id, id));
  done(project.id);
}

/** Issues a numbered invoice for a milestone, e.g. MUM-2026-0007. Works for paid milestones too (as a receipt). */
export async function createInvoice(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "payments");
  const id = String(form.get("id"));
  const m = await db.query.milestones.findFirst({ where: and(eq(milestones.id, id), eq(milestones.projectId, project.id)) });
  if (!m || m.invoiceNumber) return;
  const prefix = `${project.office.city.slice(0, 3).toUpperCase()}-${new Date().getFullYear()}-`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(milestones)
      .where(like(milestones.invoiceNumber, `${prefix}%`));
    const invoiceNumber = `${prefix}${String(n + 1 + attempt).padStart(4, "0")}`;
    try {
      await db
        .update(milestones)
        .set({ invoiceNumber, invoicedAt: new Date(), status: m.status === "PAID" ? "PAID" : "INVOICED" })
        .where(eq(milestones.id, m.id));
      break;
    } catch {
      // Number taken by a parallel invoice; try the next one.
    }
  }
  done(project.id);
}

export async function undoPayment(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "payments");
  const m0 = await db.query.milestones.findFirst({ where: and(eq(milestones.id, String(form.get("id"))), eq(milestones.projectId, project.id)) });
  const m0Status = m0?.invoiceNumber ? ("INVOICED" as const) : ("PENDING" as const);
  await db
    .update(milestones)
    .set({ status: m0Status, paidAmount: null, paidAt: null, reference: null })
    .where(and(eq(milestones.id, String(form.get("id"))), eq(milestones.projectId, project.id)));
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  done(project.id);
}
