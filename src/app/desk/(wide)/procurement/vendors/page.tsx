import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, vendors } from "@/db";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, Section } from "@/components/ui";
import { VendorForm } from "./vendor-form";

export default async function VendorsPage() {
  await requireUser("orders");
  const rows = await db.query.vendors.findMany({ with: { orders: true }, orderBy: asc(vendors.name) });
  return (
    <div className="grid gap-5">
      <div>
        <Link href="/desk/procurement" className="text-xs font-semibold text-muted">
          ← Procurement
        </Link>
        <h1 className="h-display text-3xl">Vendors</h1>
      </div>
      <Section title="Add a vendor">
        <VendorForm />
      </Section>
      {!rows.length && <Empty>No vendors yet.</Empty>}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((v) => {
          const delivered = v.orders.filter((o) => o.deliveredAt && o.eta);
          const onTime = delivered.filter((o) => o.deliveredAt! <= new Date(o.eta!.getTime() + 86400000)).length;
          const pos = new Set(v.orders.map((o) => o.poNumber).filter(Boolean)).size;
          return (
            <Link key={v.id} href={`/desk/procurement/vendors/${v.id}`} className="card block p-4 hover:border-brass/40">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{v.name}</p>
                {!v.active && <Badge>Inactive</Badge>}
              </div>
              <p className="text-xs text-muted">{[v.category, v.city, v.country, v.currency].filter(Boolean).join(" · ")}</p>
              <p className="mt-2 text-xs text-muted">
                {pos} PO{pos === 1 ? "" : "s"}
                {v.leadTimeDays ? ` · ~${v.leadTimeDays} days lead time` : ""}
                {delivered.length ? ` · on time ${Math.round((onTime / delivered.length) * 100)}%` : ""}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
