import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, rateItems } from "@/db";
import { dateTime, money, round2 } from "@/lib/format";
import { Empty, Section, StatusBadge } from "@/components/ui";
import { loadProject } from "../../data";
import { projectMargin } from "@/lib/margin";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { normaliseSetup, PRICE_MODE_LABELS, PRICE_MODES, quoteTotals, sectionLetter, TAX_MODE_LABELS, TAX_MODES } from "@/lib/quote-setup";
import { orderedRooms, sortItems } from "@/lib/boq-order";
import { AiBoqDraft } from "./ai-draft";
import { PlanBuilder } from "./plan-builder";
import { addBoqItem, createQuote, deleteBoqItem, setQuoteStatus, updateBoqItem } from "../../money-actions";
import { deleteRoom, moveBoqItem, moveRoom, saveQuoteNotes, saveQuoteSetup, saveRoomSection } from "../../boq-actions";

export default async function BoqPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ brief?: string }> }) {
  const { id } = await params;
  const { brief } = await searchParams;
  const { user, project } = await loadProject(id, "boq");
  const [rates, { quoteNotes }] = await Promise.all([db.select().from(rateItems).orderBy(asc(rateItems.sortOrder), asc(rateItems.category), asc(rateItems.name)), getSettings()]);
  const setup = normaliseSetup(project.quoteSetup, quoteNotes);
  const cur = project.office.currency;
  const items = project.boqItems;
  const rooms = orderedRooms(items, setup.roomOrder);
  const sum = round2(items.reduce((a, i) => a + i.qty * i.unitPrice, 0));
  const cost = round2(items.reduce((a, i) => a + i.qty * i.unitCost, 0));
  const t = quoteTotals(sum, setup, project.office.taxRate);
  const margin = t.subtotal ? Math.round(((t.subtotal - cost) / t.subtotal) * 100) : 0;
  const trueMargin = await projectMargin(project.id);
  const orderedIds = new Set(project.orders.map((o) => o.boqItemId).filter(Boolean));
  const plans = project.designs.filter((d) => d.scene).map((d) => ({ id: d.id, title: `${d.title}${d.room ? ` · ${d.room}` : ""} (v${d.version})` }));
  const categories = [...new Set(rates.map((r) => r.category))];
  const rateOptions = categories.map((c) => (
    <optgroup key={c} label={c}>
      {rates
        .filter((r) => r.category === c)
        .map((r) => (
          <option key={r.id} value={r.id}>
            {r.title || r.name} — {money(r.price, r.currency)}/{r.unit}
          </option>
        ))}
    </optgroup>
  ));
  const roomTotal = (room: string) => items.filter((i) => i.room === room).reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const editDefault = can(user.role, "rates");

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="label">{setup.totalOverride ? "Quoted amount" : "Items total"}</p>
          <p className="h-display text-2xl">{money(t.amount, cur)}</p>
          {setup.totalOverride ? <p className="text-xs text-muted">Items add up to {money(sum, cur)}</p> : null}
        </div>
        <div className="card p-4">
          <p className="label">
            {project.office.taxLabel} {project.office.taxRate}% · {setup.taxMode === "add" ? "on top" : setup.taxMode === "included" ? "included" : "not shown"}
          </p>
          <p className="h-display text-2xl">{setup.taxMode === "none" ? "—" : money(t.tax, cur)}</p>
        </div>
        <div className="card p-4">
          <p className="label">Contract value</p>
          <p className="h-display text-2xl">{money(t.total, cur)}</p>
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

      <Section title="Build from floor plan">
        <PlanBuilder projectId={project.id} plans={plans} currency={cur} />
      </Section>

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
        {!items.length && <Empty>No items yet. Build from the floor plan above, or add items below.</Empty>}
        {rooms.map((room, ri) => (
          <div key={room} className="mb-6">
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-paper p-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-white">{sectionLetter(ri)}</span>
              <form action={saveRoomSection} className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="room" value={room} />
                <input name="name" defaultValue={room} className="input w-52 py-1.5 font-semibold" aria-label="Room name" />
                <input name="size" defaultValue={setup.roomSizes[room] ?? ""} placeholder={`Size, e.g. 12'2" x 10'`} className="input w-36 py-1.5" aria-label="Room size" />
                <button className="btn-ghost px-2 py-1 text-xs">Save</button>
              </form>
              <span className="text-sm font-semibold">{money(roomTotal(room), cur)}</span>
              <form action={moveRoom} className="flex gap-1">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="room" value={room} />
                <button name="dir" value="up" className="btn-ghost px-2 py-1 text-xs" disabled={ri === 0} aria-label="Move room up">
                  ↑
                </button>
                <button name="dir" value="down" className="btn-ghost px-2 py-1 text-xs" disabled={ri === rooms.length - 1} aria-label="Move room down">
                  ↓
                </button>
              </form>
              <details className="relative">
                <summary className="btn-ghost cursor-pointer list-none px-2 py-1 text-xs text-clay">Remove</summary>
                <form action={deleteRoom} className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-line bg-white p-3 text-xs shadow-lg">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="room" value={room} />
                  <p className="mb-2">Remove {room} and all its items?</p>
                  <button className="btn-ghost px-2 py-1 text-xs text-clay">Yes, remove</button>
                </form>
              </details>
            </div>
            <div className="grid gap-2">
              {sortItems(items.filter((i) => i.room === room)).map((i, ii, arr) => (
                <form key={i.id} action={updateBoqItem} className="grid gap-2 rounded-xl border border-line p-2 text-sm">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="room" value={i.room} />
                  <div className="grid grid-cols-2 items-center gap-2 md:grid-cols-[auto_2.4fr_0.9fr_0.6fr_0.5fr_0.8fr_0.8fr_0.9fr_auto]">
                    <span className="hidden w-6 text-center text-xs text-muted md:block">{ii + 1}</span>
                    <input name="title" defaultValue={i.title ?? ""} placeholder="TITLE" className="input py-1.5 font-semibold uppercase" aria-label="Title" />
                    <input name="size" defaultValue={i.size ?? ""} placeholder="Size" className="input py-1.5" aria-label="Size" />
                    <input name="qty" type="number" step="0.01" defaultValue={i.qty} className="input py-1.5" aria-label="Qty" />
                    <input name="unit" defaultValue={i.unit} className="input py-1.5" aria-label="Unit" />
                    <input name="unitCost" type="number" step="0.01" defaultValue={i.unitCost} className="input py-1.5" aria-label="Unit cost" title="Unit cost (internal)" />
                    <input name="unitPrice" type="number" step="0.01" defaultValue={i.unitPrice} className="input py-1.5" aria-label="Unit price" title="Unit price to client" />
                    <span className="text-right font-semibold">
                      {money(i.qty * i.unitPrice, cur)}
                      {orderedIds.has(i.id) && <span className="block text-[10px] font-semibold uppercase text-olive">Ordered</span>}
                    </span>
                    <div className="flex justify-end gap-1">
                      <button formAction={moveBoqItem} name="dir" value="up" className="btn-ghost px-1.5 py-1.5 text-xs" disabled={ii === 0} aria-label="Move up">
                        ↑
                      </button>
                      <button formAction={moveBoqItem} name="dir" value="down" className="btn-ghost px-1.5 py-1.5 text-xs" disabled={ii === arr.length - 1} aria-label="Move down">
                        ↓
                      </button>
                      <button className="btn-ghost px-2 py-1.5 text-xs">Save</button>
                      <button formAction={deleteBoqItem} className="btn-ghost px-2 py-1.5 text-xs text-clay" aria-label="Delete">
                        ✕
                      </button>
                    </div>
                  </div>
                  <textarea name="description" defaultValue={i.description} rows={2} className="input py-1.5 text-xs md:ml-8" aria-label="Description of work" />
                </form>
              ))}
              <form action={addBoqItem} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-2 text-sm">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="room" value={room} />
                <select name="rateItemId" className="input min-w-0 flex-1 py-1.5" defaultValue="" required aria-label="Item from library">
                  <option value="" disabled>
                    + Add an item to {room} from the library…
                  </option>
                  {rateOptions}
                </select>
                <input name="size" placeholder="Size" className="input w-28 py-1.5" aria-label="Size" />
                <input name="qty" type="number" step="0.01" defaultValue={1} className="input w-20 py-1.5" aria-label="Qty" />
                <button className="btn-ghost px-3 py-1.5 text-xs">Add</button>
              </form>
            </div>
          </div>
        ))}
        {items.length > 0 && <p className="text-xs text-muted">Columns: title · size · qty · unit · unit cost (internal) · unit price (client) · amount — description of work underneath.</p>}
      </Section>

      <Section title="Quote style">
        <form action={saveQuoteSetup} className="grid gap-4">
          <input type="hidden" name="projectId" value={project.id} />
          <div>
            <label className="label">Quote title</label>
            <input name="title" defaultValue={setup.title} placeholder={`e.g. Interior work of 2BHK flat, ${project.siteAddress?.split(",").slice(-2, -1)[0]?.trim() || "Dombivli"}`} className="input" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <fieldset>
              <legend className="label">Prices on the quote</legend>
              <div className="grid gap-1.5">
                {PRICE_MODES.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="mode" value={m} defaultChecked={setup.mode === m} />
                    {PRICE_MODE_LABELS[m]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">{project.office.taxLabel}</legend>
              <div className="grid gap-1.5">
                {TAX_MODES.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="taxMode" value={m} defaultChecked={setup.taxMode === m} />
                    {TAX_MODE_LABELS[m].replace("GST", project.office.taxLabel)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="label">Round-figure total (optional)</label>
              <input name="totalOverride" type="number" step="1" min="0" defaultValue={setup.totalOverride ?? ""} placeholder={String(Math.round(sum))} className="input" />
              <p className="mt-1 text-xs text-muted">
                Items add up to {money(sum, cur)}. Leave empty to quote that.{setup.taxMode === "add" ? ` ${project.office.taxLabel} is added on top.` : ""}
              </p>
            </div>
          </div>
          <div>
            <button className="btn-primary">Save quote style</button>
          </div>
        </form>
      </Section>

      <Section title="Quote notes">
        <form action={saveQuoteNotes} className="grid gap-3">
          <input type="hidden" name="projectId" value={project.id} />
          <p className="text-xs text-muted">One point per line. Printed after the total on this project&apos;s quotes.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Material rates</label>
              <textarea name="rates" rows={7} defaultValue={setup.notes.rates.join("\n")} className="input text-xs" />
            </div>
            <div>
              <label className="label">Brand or quality materials</label>
              <textarea name="brands" rows={7} defaultValue={setup.notes.brands.join("\n")} className="input text-xs" />
            </div>
            <div>
              <label className="label">Budget note</label>
              <textarea name="budgetNote" rows={2} defaultValue={setup.notes.budgetNote} className="input text-xs" />
            </div>
            <div>
              <label className="label">Not included</label>
              <textarea name="exclusions" rows={2} defaultValue={setup.notes.exclusions.join("\n")} className="input text-xs" />
            </div>
            <div>
              <label className="label">Other suggested packages</label>
              <textarea name="packages" rows={4} defaultValue={setup.notes.packages.join("\n")} className="input text-xs" />
            </div>
            <div>
              <label className="label">Terms</label>
              <textarea name="terms" rows={4} defaultValue={setup.notes.terms} className="input text-xs" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary">Save notes</button>
            {editDefault && (
              <button name="asDefault" value="1" className="btn-ghost text-xs">
                Save &amp; use for all new quotes
              </button>
            )}
            <button name="reset" value="1" className="btn-ghost text-xs">
              Reset to company notes
            </button>
          </div>
        </form>
      </Section>

      <AiBoqDraft initialBrief={brief?.slice(0, 3000)} projectId={project.id} currency={cur} rates={rates.map((r) => ({ id: r.id, price: r.price }))} />

      <Section title="Add an item to a new room">
        <form action={addBoqItem} className="grid items-end gap-2 md:grid-cols-[1fr_2fr_0.7fr_auto]">
          <input type="hidden" name="projectId" value={project.id} />
          <div>
            <label className="label">Room</label>
            <input name="room" list="rooms" placeholder="e.g. Kitchen" className="input" />
            <datalist id="rooms">
              {["Entrance", "Living / dining room", "Kitchen", "Master bedroom", "Bedroom 2", "Kids bedroom", "Bathrooms & others", "Whole flat", ...rooms].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">From rate library</label>
            <select name="rateItemId" className="input" defaultValue="">
              <option value="">— Custom item (fill below) —</option>
              {rateOptions}
            </select>
          </div>
          <div>
            <label className="label">Qty</label>
            <input name="qty" type="number" step="0.01" defaultValue={1} className="input" />
          </div>
          <button className="btn-primary">Add</button>
          <details className="md:col-span-4">
            <summary className="cursor-pointer text-xs font-semibold text-brass">Custom item or override price</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input name="title" placeholder="TITLE (e.g. WARDROBE)" className="input uppercase" />
              <input name="size" placeholder="Size (e.g. 7' x 9')" className="input" />
              <input name="unit" placeholder="Unit (sq ft, rft, nos…)" className="input" />
              <textarea name="description" placeholder="Description of work" rows={2} className="input sm:col-span-3" />
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
                <span className="ml-2 text-xs font-normal text-muted">{PRICE_MODE_LABELS[q.mode as keyof typeof PRICE_MODE_LABELS] ?? ""}</span>
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
