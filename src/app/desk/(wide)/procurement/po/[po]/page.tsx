import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, orderStatusEnum, orders } from "@/db";
import { requireUser } from "@/lib/auth";
import { officeScope } from "@/lib/permissions";
import { date, dateInput, money, titleCase } from "@/lib/format";
import { PrintButton } from "@/components/print-button";
import { StatusBadge } from "@/components/ui";
import { updatePo } from "../../actions";

export default async function PoPage({ params }: { params: Promise<{ po: string }> }) {
  const { po } = await params;
  const user = await requireUser("orders");
  const lines = await db.query.orders.findMany({
    where: eq(orders.poNumber, decodeURIComponent(po)),
    with: { project: { with: { office: true } }, vendorRef: true },
    orderBy: asc(orders.item),
  });
  const scope = officeScope(user);
  if (!lines.length || (scope && lines.some((l) => l.project.officeId !== scope))) notFound();
  const first = lines[0];
  const v = first.vendorRef;
  const cur = first.currency ?? "";
  const total = lines.reduce((a, l) => a + (l.qty ?? 0) * (l.unitCost ?? 0), 0);

  return (
    <div className="grid gap-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/desk/procurement" className="text-xs font-semibold text-muted">
          ← Procurement
        </Link>
        <PrintButton />
      </div>

      <form action={updatePo} className="no-print card grid items-end gap-3 p-4 sm:grid-cols-5">
        <input type="hidden" name="poNumber" value={first.poNumber!} />
        <div>
          <label className="label">Status (all lines)</label>
          <select name="status" defaultValue={first.status} className="input">
            {orderStatusEnum.enumValues.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">ETA</label>
          <input name="eta" type="date" defaultValue={dateInput(first.eta)} className="input" />
        </div>
        <div>
          <label className="label">Container / AWB</label>
          <input name="containerNo" defaultValue={first.containerNo ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Port</label>
          <input name="port" defaultValue={first.port ?? ""} placeholder="Nhava Sheva, Jebel Ali…" className="input" />
        </div>
        <button className="btn-primary">Update shipment</button>
      </form>

      <article className="card p-6 sm:p-10 print:border-0 print:p-0">
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row">
          <div>
            <p className="h-display text-4xl">Zukhti Home</p>
            <p className="text-sm text-muted">Purchase order · {first.project.office.name}</p>
          </div>
          <div className="text-sm sm:text-right">
            <p className="text-lg font-semibold">{first.poNumber}</p>
            <p className="text-muted">Date {date(first.orderedAt)}</p>
            <p className="text-muted">Required by {date(first.eta)}</p>
            <p className="no-print mt-1">
              <StatusBadge status={first.status} />
            </p>
          </div>
        </header>
        <section className="mb-6 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="label">Supplier</p>
            <p className="font-semibold">{v?.name ?? first.vendor}</p>
            {v && <p className="text-muted">{[v.contactName, v.phone, v.email].filter(Boolean).join(" · ")}</p>}
            {v && <p className="text-muted">{[v.city, v.country].filter(Boolean).join(", ")}</p>}
          </div>
          <div>
            <p className="label">For project</p>
            <p className="font-semibold">{first.project.code}</p>
            <p className="text-muted">Ship to: {first.project.office.name}</p>
          </div>
        </section>
        <div className="overflow-x-auto">
          <table className="table-clean">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit price</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.item}</td>
                  <td className="whitespace-nowrap text-right">
                    {l.qty} {l.unit}
                  </td>
                  <td className="whitespace-nowrap text-right">{l.unitCost != null ? money(l.unitCost, cur) : "—"}</td>
                  <td className="whitespace-nowrap text-right font-semibold">{money((l.qty ?? 0) * (l.unitCost ?? 0), cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-6 flex w-full max-w-xs justify-between border-t border-ink pt-2 text-base font-bold">
          <span>Total</span>
          <span>{money(total, cur)}</span>
        </div>
        {first.notes && <p className="mt-6 text-sm">Notes: {first.notes}</p>}
        {(first.containerNo || first.port) && (
          <p className="mt-2 text-sm text-muted">
            Shipment: {[first.containerNo && `container ${first.containerNo}`, first.port && `to ${first.port}`].filter(Boolean).join(", ")}
          </p>
        )}
        <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">Please confirm this order, price and delivery date in writing. Quote the PO number on all invoices and packing lists.</footer>
      </article>
    </div>
  );
}
