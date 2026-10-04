import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, orders, vendors } from "@/db";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { Empty, Section, StatusBadge } from "@/components/ui";
import { VendorForm } from "../vendor-form";

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser("orders");
  const v = await db.query.vendors.findFirst({ where: eq(vendors.id, id), with: { orders: { with: { project: true }, orderBy: desc(orders.orderedAt) } } });
  if (!v) notFound();
  return (
    <div className="grid gap-5">
      <div>
        <Link href="/desk/procurement/vendors" className="text-xs font-semibold text-muted">
          ← Vendors
        </Link>
        <h1 className="h-display text-3xl">{v.name}</h1>
      </div>
      <Section title="Details">
        <VendorForm vendor={v} />
      </Section>
      <Section title="Order history">
        {!v.orders.length && <Empty>No orders yet.</Empty>}
        <ul className="divide-y divide-line text-sm">
          {v.orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {o.poNumber ? (
                  <Link href={`/desk/procurement/po/${o.poNumber}`} className="font-semibold hover:text-brass">
                    {o.poNumber}
                  </Link>
                ) : (
                  "—"
                )}{" "}
                · {o.item} · {o.project.name}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {o.unitCost != null && o.currency ? money((o.qty ?? 0) * o.unitCost, o.currency) : ""} · ETA {date(o.eta)}
                {o.deliveredAt ? ` · delivered ${date(o.deliveredAt)}` : ""}
                <StatusBadge status={o.status} />
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
