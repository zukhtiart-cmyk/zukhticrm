import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { boqItems, db, projects, vendors } from "@/db";
import { requireUser } from "@/lib/auth";
import { officeScope } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { Empty } from "@/components/ui";
import { PoBuilder } from "./po-builder";

export default async function NewPoPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser("orders");
  const { project } = await searchParams;
  const scope = officeScope(user);
  const [rows, vendorRows, settings] = await Promise.all([
    db.query.projects.findMany({
      where: and(scope ? eq(projects.officeId, scope) : undefined, ne(projects.status, "HANDED_OVER")),
      with: { office: true, client: true, boqItems: { orderBy: [asc(boqItems.room), asc(boqItems.createdAt)], with: { orders: true } } },
      orderBy: asc(projects.name),
    }),
    db.select().from(vendors).where(eq(vendors.active, true)).orderBy(asc(vendors.name)),
    getSettings(),
  ]);

  return (
    <div className="grid gap-5">
      <div>
        <Link href="/desk/procurement" className="text-xs font-semibold text-muted">
          ← Procurement
        </Link>
        <h1 className="h-display text-3xl">New purchase order</h1>
        <p className="text-sm text-muted">Pick BOQ lines to order from one vendor. Costs are in the vendor&apos;s currency; the exchange rate is fixed on the PO.</p>
      </div>
      {!vendorRows.length ? (
        <Empty>
          Add a vendor first —{" "}
          <Link href="/desk/procurement/vendors" className="font-semibold text-brass">
            Vendors
          </Link>
        </Empty>
      ) : (
        <PoBuilder
          initialProjectId={rows.some((p) => p.id === project) ? project! : (rows[0]?.id ?? "")}
          fx={settings.fxRates}
          vendors={vendorRows.map((v) => ({ id: v.id, name: v.name, currency: v.currency, leadTimeDays: v.leadTimeDays }))}
          projects={rows.map((p) => ({
            id: p.id,
            name: `${p.name} — ${p.client.name}`,
            currency: p.office.currency,
            lines: p.boqItems.map((b) => ({
              id: b.id,
              room: b.room,
              description: b.description,
              unit: b.unit,
              qty: b.qty,
              unitCost: b.unitCost,
              ordered: b.orders.reduce((a, o) => a + (o.qty ?? 0), 0),
            })),
          }))}
        />
      )}
    </div>
  );
}
