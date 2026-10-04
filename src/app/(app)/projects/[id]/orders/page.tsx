import { orderStatusEnum } from "@/db";
import { can } from "@/lib/permissions";
import Link from "next/link";
import { date, dateInput, money, titleCase } from "@/lib/format";
import { Empty, Section, StatusBadge } from "@/components/ui";
import { loadProject } from "../../data";
import { saveOrder } from "../../actions";

export default async function OrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await loadProject(id);
  const edit = can(user.role, "orders");
  const showCost = can(user.role, "orders") || can(user.role, "boq");
  const cur = project.office.currency;
  const pos = [...new Set(project.orders.map((o) => o.poNumber).filter((x): x is string => !!x))];

  return (
    <div className="grid gap-5">
      {edit && (
        <div className="flex justify-end">
          <Link href={`/desk/procurement/new?project=${project.id}`} className="btn-brass">
            Raise purchase order
          </Link>
        </div>
      )}
      {pos.length > 0 && (
        <Section title="Purchase orders">
          <ul className="divide-y divide-line text-sm">
            {pos.map((po) => {
              const lines = project.orders.filter((o) => o.poNumber === po);
              const f = lines[0];
              const total = lines.reduce((a, l) => a + (l.qty ?? 0) * (l.unitCost ?? 0), 0);
              return (
                <li key={po} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    {edit ? (
                      <Link href={`/desk/procurement/po/${po}`} className="font-semibold hover:text-brass">
                        {po}
                      </Link>
                    ) : (
                      <span className="font-semibold">{po}</span>
                    )}{" "}
                    · {f.vendor} · {lines.length} line{lines.length > 1 ? "s" : ""}
                    {f.containerNo ? ` · container ${f.containerNo}` : ""}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {showCost && f.currency && (
                      <>
                        {money(total, f.currency)}
                        {f.currency !== cur && ` ≈ ${money(total * (f.fxRate ?? 1), cur)}`} ·
                      </>
                    )}
                    ETA {date(f.eta)}
                    <StatusBadge status={f.status} />
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      <Section title="Orders & deliveries">
        {!project.orders.length && <Empty>No orders yet.</Empty>}
        <div className="grid gap-3">
          {project.orders.map((o) =>
            edit ? (
              <form key={o.id} action={saveOrder} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={o.id} />
                <div>
                  <label className="label">Item</label>
                  <input name="item" defaultValue={o.item} className="input" />
                </div>
                <div>
                  <label className="label">Vendor</label>
                  <input name="vendor" defaultValue={o.vendor ?? ""} className="input" />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select name="status" defaultValue={o.status} className="input">
                    {orderStatusEnum.enumValues.map((v) => (
                      <option key={v} value={v}>
                        {titleCase(v)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">ETA</label>
                  <input name="eta" type="date" defaultValue={dateInput(o.eta)} className="input" />
                </div>
                <button className="btn-ghost">Save</button>
              </form>
            ) : (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                <div>
                  <p className="font-semibold">{o.item}</p>
                  <p className="text-xs text-muted">{o.vendor ?? "—"} · ETA {date(o.eta)}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>
            ),
          )}
        </div>
      </Section>
      {edit && (
        <Section title="Add an order">
          <form action={saveOrder} className="grid items-end gap-2 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
            <input type="hidden" name="projectId" value={project.id} />
            <div>
              <label className="label">Item</label>
              <input name="item" required className="input" />
            </div>
            <div>
              <label className="label">Vendor</label>
              <input name="vendor" className="input" />
            </div>
            <div>
              <label className="label">Status</label>
              <select name="status" className="input">
                {orderStatusEnum.enumValues.map((v) => (
                  <option key={v} value={v}>
                    {titleCase(v)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ETA</label>
              <input name="eta" type="date" className="input" />
            </div>
            <button className="btn-primary">Add</button>
          </form>
        </Section>
      )}
    </div>
  );
}
