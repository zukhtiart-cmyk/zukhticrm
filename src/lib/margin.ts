import "server-only";
import { eq } from "drizzle-orm";
import { boqItems, db, orders } from "@/db";
import { round2 } from "./format";

/**
 * Project margin in the project's currency (before tax).
 * Sell = BOQ sell prices. Cost = actual purchase-order cost where an item has been ordered
 * (converted at the rate fixed on the PO), otherwise the BOQ's estimated cost.
 */
export async function projectMargin(projectId: string) {
  const [items, pos] = await Promise.all([
    db.select().from(boqItems).where(eq(boqItems.projectId, projectId)),
    db.select().from(orders).where(eq(orders.projectId, projectId)),
  ]);
  const sell = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const estimated = items.reduce((a, i) => a + i.qty * i.unitCost, 0);
  const poCost = (o: (typeof pos)[number]) => (o.qty ?? 0) * (o.unitCost ?? 0) * (o.fxRate ?? 1);
  let actual = 0;
  let orderedLines = 0;
  for (const i of items) {
    const linked = pos.filter((o) => o.boqItemId === i.id && o.unitCost != null);
    if (linked.length) {
      actual += linked.reduce((a, o) => a + poCost(o), 0);
      orderedLines++;
    } else actual += i.qty * i.unitCost;
  }
  // Orders not tied to a BOQ line (extras) are added on top.
  const extras = pos.filter((o) => !o.boqItemId && o.unitCost != null).reduce((a, o) => a + poCost(o), 0);
  const cost = actual + extras;
  return {
    sell: round2(sell),
    estimatedCost: round2(estimated),
    cost: round2(cost),
    margin: round2(sell - cost),
    marginPct: sell ? Math.round(((sell - cost) / sell) * 1000) / 10 : 0,
    estimatedPct: sell ? Math.round(((sell - estimated) / sell) * 1000) / 10 : 0,
    orderedLines,
    totalLines: items.length,
    extras: round2(extras),
  };
}
