import { orderStatusEnum } from "@/db";
import { can } from "@/lib/permissions";
import { date, dateInput, titleCase } from "@/lib/format";
import { Empty, Section, StatusBadge } from "@/components/ui";
import { loadProject } from "../../data";
import { saveOrder } from "../../actions";

export default async function OrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await loadProject(id);
  const edit = can(user.role, "orders");

  return (
    <div className="grid gap-5">
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
