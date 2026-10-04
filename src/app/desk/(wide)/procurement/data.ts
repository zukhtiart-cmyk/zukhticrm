import "server-only";
import { desc, isNotNull } from "drizzle-orm";
import { db, orders } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { officeScope } from "@/lib/permissions";

export type PoSummary = Awaited<ReturnType<typeof listPos>>[number];

/** Purchase orders grouped by PO number, newest first, limited to the viewer's offices. */
export async function listPos(user: CurrentUser) {
  const rows = await db.query.orders.findMany({
    where: isNotNull(orders.poNumber),
    with: { project: { with: { office: true } }, vendorRef: true },
    orderBy: desc(orders.orderedAt),
  });
  const scope = officeScope(user);
  const map = new Map<string, typeof rows>();
  for (const r of rows) {
    if (scope && r.project.officeId !== scope) continue;
    map.set(r.poNumber!, [...(map.get(r.poNumber!) ?? []), r]);
  }
  return [...map.entries()].map(([poNumber, lines]) => {
    const first = lines[0];
    const total = lines.reduce((a, l) => a + (l.qty ?? 0) * (l.unitCost ?? 0), 0);
    const statuses = [...new Set(lines.map((l) => l.status))];
    return {
      poNumber,
      lines,
      project: first.project,
      vendor: first.vendorRef,
      vendorName: first.vendorRef?.name ?? first.vendor ?? "—",
      currency: first.currency ?? "",
      total,
      totalProjectCurrency: total * (first.fxRate ?? 1),
      status: statuses.length === 1 ? statuses[0] : "MIXED",
      eta: first.eta,
      orderedAt: first.orderedAt,
      late: !!first.eta && first.eta < new Date() && statuses.some((s) => s !== "DELIVERED"),
    };
  });
}
