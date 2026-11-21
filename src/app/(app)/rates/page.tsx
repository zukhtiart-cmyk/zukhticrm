import { asc } from "drizzle-orm";
import { db, rateItems } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Section, Empty } from "@/components/ui";
import { deleteRate, loadStandardItems, saveRate } from "./actions";
import { ROOM_GROUPS, ROOM_GROUP_LABELS, type RoomGroup } from "@/lib/boq-library";
import { saveFxRates } from "@/app/desk/(wide)/procurement/actions";
import { getSettings } from "@/lib/settings";
import { can } from "@/lib/permissions";

export const metadata = { title: "Rate library" };

function RateFields({ r }: { r?: typeof rateItems.$inferSelect }) {
  return (
    <>
      <input name="category" defaultValue={r?.category} placeholder="Category" className="input py-1.5" aria-label="Category" />
      <input name="name" defaultValue={r?.name} placeholder="Item" required className="input py-1.5" aria-label="Item" />
      <input name="unit" defaultValue={r?.unit} placeholder="Unit" className="input py-1.5" aria-label="Unit" />
      <input name="cost" type="number" step="0.01" defaultValue={r?.cost} placeholder="Cost" className="input py-1.5" aria-label="Cost" />
      <input name="price" type="number" step="0.01" defaultValue={r?.price} placeholder="Price" className="input py-1.5" aria-label="Price" />
      <input name="currency" defaultValue={r?.currency ?? "INR"} className="input py-1.5" aria-label="Currency" />
    </>
  );
}

/** Quote wording and floor-plan settings, under the main row. */
function QuoteFields({ r }: { r?: typeof rateItems.$inferSelect }) {
  return (
    <details className="col-span-full text-xs" open={!r}>
      <summary className="cursor-pointer text-muted">
        {r?.title ? <b className="text-ink">{r.title}</b> : "Quote wording"}
        {r?.roomTypes?.length ? ` · from plan: ${r.roomTypes.map((g) => ROOM_GROUP_LABELS[g as RoomGroup] ?? g).join(", ")}` : ""}
        {r?.preselect ? " · standard pick" : ""}
      </summary>
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_3fr]">
        <input name="title" defaultValue={r?.title ?? ""} placeholder="TITLE on the quote (e.g. WARDROBE)" className="input py-1.5 uppercase" aria-label="Title" />
        <textarea name="spec" defaultValue={r?.spec ?? ""} rows={2} placeholder="Description of work, as written on the quote" className="input py-1.5" aria-label="Description" />
      </div>
      <input type="hidden" name="planSent" value="1" />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted">Offer when building from a plan in:</span>
        {ROOM_GROUPS.map((g) => (
          <label key={g} className="flex items-center gap-1">
            <input type="checkbox" name="roomTypes" value={g} defaultChecked={r?.roomTypes?.includes(g)} />
            {ROOM_GROUP_LABELS[g]}
          </label>
        ))}
        <label className="flex items-center gap-1">
          <input type="checkbox" name="preselect" value="1" defaultChecked={r?.preselect} /> Ticked by default
        </label>
        <select name="qtyRule" defaultValue={r?.qtyRule ?? "one"} className="input w-auto py-1" aria-label="Quantity from plan">
          {Object.entries(QTY_RULES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
          {r?.qtyRule && !(r.qtyRule in QTY_RULES) && <option value={r.qtyRule}>{r.qtyRule}</option>}
        </select>
      </div>
    </details>
  );
}

const QTY_RULES: Record<string, string> = {
  one: "Qty 1 (nos)",
  lumpsum: "Lump sum",
  area: "Floor area (sq ft)",
  ceiling: "Ceiling area (sq ft)",
  paint: "Wall + ceiling paint area (sq ft)",
  skirting: "Room perimeter (rft)",
  "furn:wardrobe:sqft": "Each wardrobe drawn (width × 9 ft)",
  "furn:bed": "Each bed drawn (nos)",
  "furn:side_table": "Each side table drawn",
  "furn:dresser": "Each dressing table drawn",
  "furn:desk": "Each study table drawn",
  "furn:tv_unit": "Each TV unit drawn",
  "furn:counter:rft": "Kitchen counter length (rft)",
  "furn:sideboard:sqft": "Each sideboard / crockery (width × 9 ft)",
  "furn:shoe_cabinet": "Each shoe cabinet drawn",
  "furn:vanity": "Each wash basin drawn",
  "furn:wc": "Each WC drawn",
  "furn:shower": "Each shower area drawn",
  "furn:puja": "Each puja unit drawn",
  "furn:none:wall": "A wall panel (width × 7 ft)",
};

const grid = "grid grid-cols-2 items-center gap-2 md:grid-cols-[1fr_2.5fr_0.7fr_1fr_1fr_0.7fr_auto]";

export default async function RatesPage() {
  const user = await requireUser("rates");
  const rows = await db.select().from(rateItems).orderBy(asc(rateItems.category), asc(rateItems.sortOrder), asc(rateItems.name));
  const { fxRates } = await getSettings();
  const canFx = can(user.role, "admin");
  return (
    <>
      <PageHeader title="Rate library" subtitle="Standard cost and sell rates used to build BOQs" />
      <div className="grid gap-5">
        <Section title={`Exchange rates (as of ${fxRates.asOf})`}>
          <p className="mb-3 text-sm text-muted">Used for purchase orders in foreign currency and for true project margins. Value = how many INR one unit buys. Each PO keeps the rate from the day it was raised.</p>
          <form action={saveFxRates} className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(fxRates.perINR)
                .filter(([c]) => c !== "INR")
                .map(([code, rate]) => (
                  <div key={code}>
                    <label className="label">1 {code} = INR</label>
                    <input name={`rate_${code}`} type="number" step="0.0001" min={0} defaultValue={rate} disabled={!canFx} className="input" />
                  </div>
                ))}
            </div>
            {canFx && (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="label">Add currency</label>
                  <input name="newCode" placeholder="GBP" maxLength={3} className="input w-24 uppercase" />
                </div>
                <div>
                  <label className="label">INR per unit</label>
                  <input name="newRate" type="number" step="0.0001" min={0} className="input w-32" />
                </div>
                <button className="btn-primary">Save rates</button>
              </div>
            )}
          </form>
        </Section>

        <Section
          title="Standard quotation items"
          actions={
            <form action={loadStandardItems}>
              <button className="btn-brass py-2">Load standard items</button>
            </form>
          }
        >
          <p className="text-sm text-muted">
            Adds the items from Zukhti&apos;s quotation (safety door, TV unit, wardrobe, bed, kitchen, bathroom work, false ceiling, painting, electrical…) with their quote wording and how
            quantities come from a floor plan. Items you already have with the same title are skipped. Starting prices are indicative — set your own rates below.
          </p>
        </Section>

        <Section title="Add a rate">
          <form action={saveRate} className={grid}>
            <RateFields />
            <button className="btn-primary py-1.5">Add</button>
            <QuoteFields />
          </form>
        </Section>
        <Section title={`Rates (${rows.length})`}>
          {!rows.length && <Empty>No rates yet.</Empty>}
          <p className="mb-2 hidden text-xs text-muted md:block">Category · item · unit · cost · sell price · currency</p>
          <div className="grid gap-2">
            {rows.map((r) => (
              <form key={r.id} action={saveRate} className={`${grid} rounded-xl border border-line p-2`}>
                <input type="hidden" name="id" value={r.id} />
                <RateFields r={r} />
                <div className="flex gap-1">
                  <button className="btn-ghost px-2 py-1.5 text-xs">Save</button>
                  <button formAction={deleteRate} className="btn-ghost px-2 py-1.5 text-xs text-clay">
                    ✕
                  </button>
                </div>
                <QuoteFields r={r} />
              </form>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
