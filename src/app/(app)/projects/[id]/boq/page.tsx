import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, rateItems } from "@/db";
import { dateTime, money, round2 } from "@/lib/format";
import { Empty, Section, StatusBadge } from "@/components/ui";
import { loadProject } from "../../data";
import { projectMargin } from "@/lib/margin";
import { AiBoqDraft } from "./ai-draft";
import { addBoqItem, createQuote, deleteBoqItem, setQuoteStatus, updateBoqItem } from "../../money-actions";

export default async function BoqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await loadProject(id, "boq");
  const rates = await db.select().from(rateItems).orderBy(asc(rateItems.category), asc(rateItems.name));
  const cur = project.office.currency;
  const items = project.boqItems;
  const rooms = [...new Set(items.map((i) => i.room))];
  const subtotal = round2(items.reduce((a, i) => a + i.qty * i.unitPrice, 0));
  const cost = round2(items.reduce((a, i) => a + i.qty * i.unitCost, 0));
  const tax = round2((subtotal * project.office.taxRate) / 100);
  const margin = subtotal ? Math.round(((subtotal - cost) / subtotal) * 100) : 0;
  const trueMargin = await projectMargin(project.id);
  const orderedIds = new Set(project.orders.map((o) => o.boqItemId).filter(Boolean));

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="label">Subtotal</p>
          <p className="h-display text-2xl">{money(subtotal, cur)}</p>
        </div>
        <div className="card p-4">
          <p className="label">
            {project.office.taxLabel} {project.office.taxRate}%
          </p>
          <p className="h-display text-2xl">{money(tax, cur)}</p>
        </div>
        <div className="card p-4">
          <p className="label">Contract value</p>
          <p className="h-display text-2xl">{money(subtotal + tax, cur)}</p>
        </div>
        <div className="card p-4">
          <p className="label">Margin (internal)</p>
          <p className={`h-display text-2xl ${trueMargin.marginPct < 20 ? "text-clay" : "text-olive"}`}>{trueMargin.marginPct}%</p>
          <p className="text-xs text-muted">
            {trueMargin.orderedLines
              ? `Using actual PO costs for ${trueMargin.orderedLines} of ${trueMargin.totalLines} lines (estimate was ${margin}%)`
              : `Estimated — cost ${money(cost, cur)}`}
          </p>
        </div>
      </div>

      <Section
        title="Bill of quantities"
        actions={
          items.length ? (
            <form action={createQuote}>
              <input type="hidden" name="projectId" value={project.id} />
              <button className="btn-brass py-2">Create quote from BOQ</button>
            </form>
          ) : null
        }
      >
        {!items.length && <Empty>No items yet. Add the first item below.</Empty>}
        {rooms.map((room) => (
          <div key={room} className="mb-5">
            <h3 className="mb-2 font-semibold">{room}</h3>
            <div className="grid gap-2">
              {items
                .filter((i) => i.room === room)
                .map((i) => (
                  <form key={i.id} action={updateBoqItem} className="grid grid-cols-2 items-center gap-2 rounded-xl border border-line p-2 text-sm md:grid-cols-[1fr_2.4fr_0.7fr_0.7fr_1fr_1fr_1fr_auto]">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="id" value={i.id} />
                    <input name="room" defaultValue={i.room} className="input py-1.5" aria-label="Room" />
                    <input name="description" defaultValue={i.description} className="input py-1.5" aria-label="Item" />
                    <input name="qty" type="number" step="0.01" defaultValue={i.qty} className="input py-1.5" aria-label="Qty" />
                    <input name="unit" defaultValue={i.unit} className="input py-1.5" aria-label="Unit" />
                    <input name="unitCost" type="number" step="0.01" defaultValue={i.unitCost} className="input py-1.5" aria-label="Unit cost" title="Unit cost (internal)" />
                    <input name="unitPrice" type="number" step="0.01" defaultValue={i.unitPrice} className="input py-1.5" aria-label="Unit price" title="Unit price to client" />
                    <span className="text-right font-semibold">
                      {money(i.qty * i.unitPrice, cur)}
                      {orderedIds.has(i.id) && <span className="block text-[10px] font-semibold uppercase text-olive">Ordered</span>}
                    </span>
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost px-2 py-1.5 text-xs">Save</button>
                      <button formAction={deleteBoqItem} className="btn-ghost px-2 py-1.5 text-xs text-clay">
                        ✕
                      </button>
                    </div>
                  </form>
                ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">Columns: room · item · qty · unit · unit cost (internal) · unit price (client) · amount</p>
      </Section>

      <AiBoqDraft projectId={project.id} currency={cur} rates={rates.map((r) => ({ id: r.id, price: r.price }))} />

      <Section title="Add an item">
        <form action={addBoqItem} className="grid items-end gap-2 md:grid-cols-[1fr_2fr_0.7fr_auto]">
          <input type="hidden" name="projectId" value={project.id} />
          <div>
            <label className="label">Room</label>
            <input name="room" list="rooms" placeholder="e.g. Kitchen" className="input" />
            <datalist id="rooms">
              {["Living", "Kitchen", "Master bedroom", "Kids bedroom", "Guest bedroom", "Dining", "Bathrooms", "Whole house", ...rooms].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">From rate library</label>
            <select name="rateItemId" className="input" defaultValue="">
              <option value="">— Custom item (fill below) —</option>
              {rates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.category}: {r.name} — {money(r.price, r.currency)}/{r.unit}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Qty</label>
            <input name="qty" type="number" step="0.01" defaultValue={1} className="input" />
          </div>
          <button className="btn-primary">Add</button>
          <details className="md:col-span-4">
            <summary className="cursor-pointer text-xs font-semibold text-brass">Custom item or override price</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <input name="description" placeholder="Description" className="input" />
              <input name="unit" placeholder="Unit (sqft, rft, nos…)" className="input" />
              <input name="unitCost" type="number" step="0.01" placeholder="Unit cost" className="input" />
              <input name="unitPrice" type="number" step="0.01" placeholder="Unit price" className="input" />
            </div>
          </details>
        </form>
      </Section>

      <Section title="Quotes">
        {!project.quotes.length && <Empty>No quotes yet.</Empty>}
        <ul className="divide-y divide-line">
          {project.quotes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <Link href={`/projects/${project.id}/quote/${q.id}`} className="font-semibold hover:text-brass">
                Quote v{q.version} — {money(q.total, q.currency)}
                <span className="ml-2 text-xs font-normal text-muted">{dateTime(q.createdAt)}</span>
              </Link>
              <div className="flex items-center gap-2">
                <StatusBadge status={q.status} />
                <form action={setQuoteStatus} className="flex gap-1">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="id" value={q.id} />
                  {q.status === "DRAFT" && (
                    <button name="status" value="SENT" className="btn-ghost px-2 py-1 text-xs">
                      Mark sent
                    </button>
                  )}
                  {q.status !== "ACCEPTED" && (
                    <button name="status" value="ACCEPTED" className="btn-ghost px-2 py-1 text-xs">
                      Mark accepted
                    </button>
                  )}
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
