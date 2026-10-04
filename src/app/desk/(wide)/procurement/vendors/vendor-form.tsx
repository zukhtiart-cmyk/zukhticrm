"use client";

import { useActionState } from "react";
import { saveVendor } from "../actions";
import { CURRENCIES } from "@/lib/fx";

type Vendor = { id?: string; name?: string; country?: string; city?: string | null; category?: string | null; contactName?: string | null; phone?: string | null; email?: string | null; currency?: string; leadTimeDays?: number | null; notes?: string | null; active?: boolean };

export function VendorForm({ vendor = {} }: { vendor?: Vendor }) {
  const [state, action, pending] = useActionState(saveVendor, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      {vendor.id && <input type="hidden" name="id" value={vendor.id} />}
      <div className="sm:col-span-2">
        <label className="label">Vendor / factory name</label>
        <input name="name" defaultValue={vendor.name} required className="input" />
      </div>
      <div>
        <label className="label">Category</label>
        <input name="category" defaultValue={vendor.category ?? ""} placeholder="Furniture, lighting, stone…" className="input" />
      </div>
      <div>
        <label className="label">Country</label>
        <input name="country" defaultValue={vendor.country ?? "China"} className="input" />
      </div>
      <div>
        <label className="label">City</label>
        <input name="city" defaultValue={vendor.city ?? ""} placeholder="Foshan" className="input" />
      </div>
      <div>
        <label className="label">Currency</label>
        <select name="currency" defaultValue={vendor.currency ?? "CNY"} className="input">
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Contact person</label>
        <input name="contactName" defaultValue={vendor.contactName ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Phone / WeChat</label>
        <input name="phone" defaultValue={vendor.phone ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" defaultValue={vendor.email ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Usual lead time (days)</label>
        <input name="leadTimeDays" type="number" min={0} defaultValue={vendor.leadTimeDays ?? ""} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Notes</label>
        <input name="notes" defaultValue={vendor.notes ?? ""} placeholder="MOQ, payment terms, quality notes…" className="input" />
      </div>
      {vendor.id && (
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="active" value="off" />
          <input type="checkbox" name="active" value="on" defaultChecked={vendor.active ?? true} /> Active
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-3">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : vendor.id ? "Save vendor" : "Add vendor"}
        </button>
        {state?.error && <span className="text-sm text-clay">{state.error}</span>}
        {state?.ok && <span className="text-sm text-olive">{state.ok}</span>}
      </div>
    </form>
  );
}
