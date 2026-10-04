import { TRADES } from "@/lib/site-costs";

type C = { name: string; trade: string; phone: string | null; officeId: string | null; rateNotes: string | null; bankDetails: string | null; active: boolean };

export function ContractorFields({ c, offices }: { c?: C; offices: { id: string; name: string }[] | null }) {
  return (
    <>
      <div>
        <label className="label">Name</label>
        <input name="name" defaultValue={c?.name} required className="input" placeholder="e.g. Ramesh Carpentry Works" />
      </div>
      <div>
        <label className="label">Trade</label>
        <select name="trade" defaultValue={c?.trade ?? "Carpenter"} className="input">
          {TRADES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Phone</label>
        <input name="phone" defaultValue={c?.phone ?? ""} className="input" placeholder="+91…" />
      </div>
      {offices && (
        <div>
          <label className="label">Office</label>
          <select name="officeId" defaultValue={c?.officeId ?? ""} className="input">
            <option value="">All offices</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="sm:col-span-2">
        <label className="label">Rates (notes)</label>
        <textarea name="rateNotes" defaultValue={c?.rateNotes ?? ""} rows={2} className="input" placeholder="Wardrobe ₹450/sqft labour, kitchen ₹900/rft…" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Bank / UPI for payments</label>
        <input name="bankDetails" defaultValue={c?.bankDetails ?? ""} className="input" placeholder="UPI id or A/c no · IFSC" />
      </div>
      {c && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" value="on" defaultChecked={c.active} className="h-4 w-4" />
          <input type="hidden" name="active" value="off" />
          Active
        </label>
      )}
    </>
  );
}
