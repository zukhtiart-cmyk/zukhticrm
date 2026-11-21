import "server-only";
import { sql } from "drizzle-orm";
import { db, rateItems } from "@/db";
import { STANDARD_ITEMS } from "./boq-library";

export async function ensureLibrary() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(rateItems).where(sql`${rateItems.qtyRule} is not null`);
  if (n === 0) await insertStandardItems();
}

/** Adds the standard items (Zukhti's quotation list) to the rate library; items with the same title are left alone. */
export async function insertStandardItems() {
  const existing = await db.select({ title: rateItems.title, name: rateItems.name }).from(rateItems);
  const have = new Set(existing.flatMap((r) => [r.title?.toUpperCase(), r.name.toUpperCase()]).filter(Boolean));
  const add = STANDARD_ITEMS.map((it, i) => ({ it, i })).filter(({ it }) => !have.has(it.title.toUpperCase()));
  if (!add.length) return 0;
  await db.insert(rateItems).values(
    add.map(({ it, i }) => ({
      category: it.category,
      name: it.title.charAt(0) + it.title.slice(1).toLowerCase(),
      title: it.title,
      spec: it.spec,
      unit: it.unit,
      price: it.price,
      cost: Math.round(it.price * 0.75),
      currency: "INR",
      roomTypes: it.rooms,
      qtyRule: it.rule,
      preselect: it.preselect,
      sortOrder: (i + 1) * 10,
    })),
  );
  return add.length;
}

