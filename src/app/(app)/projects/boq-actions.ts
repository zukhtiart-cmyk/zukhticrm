"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { boqItems, db, designs, projects, rateItems } from "@/db";
import { syncMilestoneAmounts } from "@/lib/projects";
import { normaliseNotes, normaliseSetup, type QuoteSetup } from "@/lib/quote-setup";
import { sectionsFromPlan, type PlanSection } from "@/lib/boq-library";
import { ensureLibrary } from "@/lib/boq-seed";
import { normaliseScene } from "@/lib/home-scene";
import { orderedRooms, sortItems } from "@/lib/boq-order";
import { getSettings, setSetting } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { assertProjectAccess } from "./data";

const done = (id: string) => revalidatePath(`/projects/${id}`, "layout");
const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

async function currentSetup(project: { quoteSetup: unknown }) {
  const { quoteNotes } = await getSettings();
  return normaliseSetup(project.quoteSetup, quoteNotes);
}

async function saveSetup(projectId: string, setup: QuoteSetup) {
  await db.update(projects).set({ quoteSetup: setup as unknown as Record<string, unknown> }).where(eq(projects.id, projectId));
}

/** Quote style: title, price style, GST, round total. */
export async function saveQuoteSetup(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const cur = await currentSetup(project);
  const next = normaliseSetup({
    ...cur,
    title: form.get("title") ?? cur.title,
    mode: form.get("mode") ?? cur.mode,
    taxMode: form.get("taxMode") ?? cur.taxMode,
    totalOverride: form.has("totalOverride") ? String(form.get("totalOverride") ?? "").replace(/[,\s]/g, "") || null : cur.totalOverride,
  });
  await saveSetup(project.id, next);
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  done(project.id);
}

/** The notes printed after the total. */
export async function saveQuoteNotes(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const cur = await currentSetup(project);
  const notes = normaliseNotes({
    rates: lines(form.get("rates")),
    budgetNote: String(form.get("budgetNote") ?? "").trim(),
    brands: lines(form.get("brands")),
    exclusions: lines(form.get("exclusions")),
    packages: lines(form.get("packages")),
    terms: String(form.get("terms") ?? "").trim(),
  });
  await saveSetup(project.id, { ...cur, notes });
  if (form.get("asDefault") === "1") {
    await requireUser("rates");
    await setSetting("quoteNotes", notes);
  }
  if (form.get("reset") === "1") {
    const { quoteNotes } = await getSettings();
    await saveSetup(project.id, { ...cur, notes: quoteNotes });
  }
  done(project.id);
}

/** Room heading: rename the room (moves its items) and set its size. */
export async function saveRoomSection(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const from = String(form.get("room") ?? "");
  const to = String(form.get("name") ?? "").trim() || from;
  const size = String(form.get("size") ?? "").trim();
  const cur = await currentSetup(project);
  if (to !== from) await db.update(boqItems).set({ room: to }).where(and(eq(boqItems.projectId, project.id), eq(boqItems.room, from)));
  const roomSizes = { ...cur.roomSizes };
  delete roomSizes[from];
  if (size) roomSizes[to] = size;
  const roomOrder = cur.roomOrder.map((r) => (r === from ? to : r));
  await saveSetup(project.id, normaliseSetup({ ...cur, roomSizes, roomOrder }));
  done(project.id);
}

/** Moves a room section up or down. */
export async function moveRoom(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const room = String(form.get("room") ?? "");
  const dir = form.get("dir") === "up" ? -1 : 1;
  const items = await db.select({ room: boqItems.room, createdAt: boqItems.createdAt }).from(boqItems).where(eq(boqItems.projectId, project.id));
  const cur = await currentSetup(project);
  const order = orderedRooms(items, cur.roomOrder);
  const i = order.indexOf(room);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  await saveSetup(project.id, { ...cur, roomOrder: order });
  done(project.id);
}

/** Moves an item up or down within its room. */
export async function moveBoqItem(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const id = String(form.get("id"));
  const item = await db.query.boqItems.findFirst({ where: and(eq(boqItems.id, id), eq(boqItems.projectId, project.id)) });
  if (!item) return;
  const list = sortItems(await db.select().from(boqItems).where(and(eq(boqItems.projectId, project.id), eq(boqItems.room, item.room))));
  const i = list.findIndex((x) => x.id === id);
  const j = i + (form.get("dir") === "up" ? -1 : 1);
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.transaction(async (tx) => {
    for (let k = 0; k < list.length; k++) if (list[k].sortOrder !== k + 1) await tx.update(boqItems).set({ sortOrder: k + 1 }).where(eq(boqItems.id, list[k].id));
  });
  done(project.id);
}

/** Removes a whole room section. */
export async function deleteRoom(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const room = String(form.get("room") ?? "");
  await db.delete(boqItems).where(and(eq(boqItems.projectId, project.id), eq(boqItems.room, room)));
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  done(project.id);
}

/** The BOQ a floor plan suggests, for the user to tick through. */
export async function planSections(projectId: string, designId: string): Promise<{ sections?: PlanSection[]; error?: string }> {
  const { project } = await assertProjectAccess(projectId, "boq");
  const d = await db.query.designs.findFirst({ where: and(eq(designs.id, designId), eq(designs.projectId, project.id)) });
  if (!d?.scene) return { error: "That design has no floor plan read yet." };
  await ensureLibrary();
  const items = await db.select().from(rateItems).orderBy(asc(rateItems.sortOrder));
  const scene = normaliseScene(d.scene);
  return { sections: sectionsFromPlan(scene, items) };
}

type PickedLine = { rateItemId: string; title: string; spec: string; unit: string; qty: number; size: string; price: number };
type PickedSection = { room: string; size: string; lines: PickedLine[] };

/** Adds the ticked lines to the BOQ, with room sizes and the plan's room order. */
export async function addPlanLines(projectId: string, picked: PickedSection[]) {
  const { project } = await assertProjectAccess(projectId, "boq");
  const ids = [...new Set(picked.flatMap((s) => s.lines.map((l) => l.rateItemId)))].filter(Boolean).slice(0, 500);
  const rates = ids.length ? await db.select().from(rateItems).where(inArray(rateItems.id, ids)) : [];
  const byId = new Map(rates.map((r) => [r.id, r]));
  const existing = await db.select().from(boqItems).where(eq(boqItems.projectId, project.id));
  const cur = await currentSetup(project);
  const rows: (typeof boqItems.$inferInsert)[] = [];
  for (const s of picked.slice(0, 60)) {
    const room = String(s.room).trim().slice(0, 60) || "General";
    let order = existing.filter((i) => i.room === room).reduce((a, i) => Math.max(a, i.sortOrder), 0);
    for (const l of s.lines.slice(0, 80)) {
      const rate = byId.get(l.rateItemId);
      const qty = Number(l.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const price = Number.isFinite(Number(l.price)) ? Number(l.price) : (rate?.price ?? 0);
      rows.push({
        projectId: project.id,
        room,
        title: String(l.title || rate?.title || "").slice(0, 120) || null,
        description: String(l.spec || rate?.spec || rate?.name || l.title).slice(0, 2000),
        size: String(l.size ?? "").slice(0, 40) || null,
        unit: String(l.unit || rate?.unit || "nos").slice(0, 20),
        qty: Math.round(qty * 100) / 100,
        unitPrice: price,
        unitCost: rate && rate.price ? Math.round((price * rate.cost) / rate.price * 100) / 100 : Math.round(price * 0.75),
        rateItemId: rate?.id ?? null,
        sortOrder: ++order,
      });
    }
  }
  if (rows.length) await db.insert(boqItems).values(rows);
  const roomSizes = { ...cur.roomSizes };
  for (const s of picked) if (s.size && !roomSizes[s.room]) roomSizes[s.room] = s.size;
  const roomOrder = [...cur.roomOrder, ...picked.map((s) => s.room).filter((r) => !cur.roomOrder.includes(r))];
  await saveSetup(project.id, normaliseSetup({ ...cur, roomSizes, roomOrder }));
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  done(project.id);
  return { added: rows.length };
}
