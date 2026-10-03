import { asc } from "drizzle-orm";
import { db, rateItems } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Section, Empty } from "@/components/ui";
import { deleteRate, saveRate } from "./actions";

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

const grid = "grid grid-cols-2 items-center gap-2 md:grid-cols-[1fr_2.5fr_0.7fr_1fr_1fr_0.7fr_auto]";

export default async function RatesPage() {
  await requireUser("rates");
  const rows = await db.select().from(rateItems).orderBy(asc(rateItems.category), asc(rateItems.name));
  return (
    <>
      <PageHeader title="Rate library" subtitle="Standard cost and sell rates used to build BOQs" />
      <div className="grid gap-5">
        <Section title="Add a rate">
          <form action={saveRate} className={grid}>
            <RateFields />
            <button className="btn-primary py-1.5">Add</button>
          </form>
        </Section>
        <Section title={`Rates (${rows.length})`}>
          {!rows.length && <Empty>No rates yet.</Empty>}
          <p className="mb-2 hidden text-xs text-muted md:block">Category · item · unit · cost · sell price · currency</p>
          <div className="grid gap-2">
            {rows.map((r) => (
              <form key={r.id} action={saveRate} className={grid}>
                <input type="hidden" name="id" value={r.id} />
                <RateFields r={r} />
                <div className="flex gap-1">
                  <button className="btn-ghost px-2 py-1.5 text-xs">Save</button>
                  <button formAction={deleteRate} className="btn-ghost px-2 py-1.5 text-xs text-clay">
                    ✕
                  </button>
                </div>
              </form>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
