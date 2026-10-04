import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { date, money, titleCase } from "@/lib/format";
import { Badge, Empty, Stat, StatusBadge } from "@/components/ui";
import { listPos } from "./data";

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser("orders");
  const { f } = await searchParams;
  const pos = await listPos(user);
  const open = pos.filter((p) => p.status !== "DELIVERED");
  const inTransit = pos.filter((p) => p.status === "SHIPPED" || p.status === "CUSTOMS");
  const late = open.filter((p) => p.late);
  const rows = f === "all" ? pos : f === "late" ? late : open;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl">Procurement</h1>
          <p className="text-sm text-muted">Purchase orders, shipments and vendors</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/desk/procurement/vendors" className="btn-ghost">
            Vendors
          </Link>
          <Link href="/desk/procurement/new" className="btn-brass">
            New purchase order
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Open POs" value={open.length} />
        <Stat label="In transit" value={inTransit.length} />
        <Stat label="Late" value={late.length} hint="past ETA, not delivered" />
      </div>

      <div className="flex gap-2 text-sm">
        {[
          ["", `Open (${open.length})`],
          ["late", `Late (${late.length})`],
          ["all", `All (${pos.length})`],
        ].map(([key, label]) => (
          <Link key={key} href={key ? `/desk/procurement?f=${key}` : "/desk/procurement"} className={`rounded-full border px-3 py-1.5 font-semibold ${(f ?? "") === key ? "border-ink bg-ink text-paper" : "border-line text-muted"}`}>
            {label}
          </Link>
        ))}
      </div>

      {!rows.length && <Empty>No purchase orders here yet.</Empty>}
      <div className="card overflow-x-auto">
        {rows.length > 0 && (
          <table className="table-clean">
            <thead>
              <tr>
                <th>PO</th>
                <th>Project</th>
                <th>Vendor</th>
                <th className="text-right">Value</th>
                <th>Status</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.poNumber}>
                  <td>
                    <Link href={`/desk/procurement/po/${p.poNumber}`} className="font-semibold hover:text-brass">
                      {p.poNumber}
                    </Link>
                    <p className="text-xs text-muted">{p.lines.length} line{p.lines.length > 1 ? "s" : ""} · {date(p.orderedAt)}</p>
                  </td>
                  <td>
                    {p.project.name}
                    <p className="text-xs text-muted">{p.project.office.name}</p>
                  </td>
                  <td>{p.vendorName}</td>
                  <td className="whitespace-nowrap text-right">
                    {p.currency ? money(p.total, p.currency) : "—"}
                    {p.currency && p.currency !== p.project.office.currency && <p className="text-xs text-muted">≈ {money(p.totalProjectCurrency, p.project.office.currency)}</p>}
                  </td>
                  <td>{p.status === "MIXED" ? <Badge>Mixed</Badge> : <StatusBadge status={p.status} />}</td>
                  <td className={`whitespace-nowrap ${p.late ? "font-semibold text-clay" : ""}`}>
                    {date(p.eta)}
                    {p.late && <p className="text-xs">late</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted">Order status changes show up automatically on the project, client portal and WhatsApp replies. Statuses: {["ORDERED", "IN_PRODUCTION", "SHIPPED", "CUSTOMS", "DELIVERED"].map(titleCase).join(" → ")}.</p>
    </div>
  );
}
