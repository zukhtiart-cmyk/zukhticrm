"use client";

import { Spinner } from "@/components/feedback";

import { useActionState } from "react";
import { BUDGET_BANDS, LEAD_SOURCES, PROPERTY_TYPES } from "@/lib/defaults";
import { dateInput } from "@/lib/format";

type Lead = {
  id?: string;
  name?: string;
  phone?: string;
  email?: string | null;
  source?: string;
  city?: string | null;
  budgetBand?: string | null;
  propertyType?: string | null;
  officeId?: string;
  ownerId?: string | null;
  notes?: string | null;
  nextFollowUpAt?: Date | null;
};

type Action = (
  state: { error?: string; ok?: string } | undefined,
  form: FormData,
) => Promise<{ error?: string; ok?: string } | undefined>;

export function LeadForm({
  action,
  lead = {},
  offices,
  owners,
  submitLabel,
}: {
  action: Action;
  lead?: Lead;
  offices: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      {lead.id && <input type="hidden" name="id" value={lead.id} />}
      <div>
        <label className="label">Name</label>
        <input
          name="name"
          defaultValue={lead.name}
          required
          className="input"
        />
      </div>
      <div>
        <label className="label">Phone (WhatsApp)</label>
        <input
          name="phone"
          defaultValue={lead.phone}
          required
          className="input"
          placeholder="+91…"
        />
      </div>
      <div>
        <label className="label">Email</label>
        <input
          name="email"
          type="email"
          defaultValue={lead.email ?? ""}
          className="input"
        />
      </div>
      <div>
        <label className="label">Source</label>
        <select
          name="source"
          defaultValue={lead.source ?? "Website"}
          className="input"
        >
          {LEAD_SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">City</label>
        <input name="city" defaultValue={lead.city ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Property type</label>
        <select
          name="propertyType"
          defaultValue={lead.propertyType ?? ""}
          className="input"
        >
          <option value="">—</option>
          {PROPERTY_TYPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Budget</label>
        <select
          name="budgetBand"
          defaultValue={lead.budgetBand ?? ""}
          className="input"
        >
          <option value="">—</option>
          {BUDGET_BANDS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Next follow-up</label>
        <input
          name="nextFollowUpAt"
          type="date"
          defaultValue={dateInput(lead.nextFollowUpAt)}
          className="input"
        />
      </div>
      <div>
        <label className="label">Office</label>
        <select
          name="officeId"
          defaultValue={lead.officeId ?? offices[0]?.id}
          className="input"
        >
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Owner</label>
        <select
          name="ownerId"
          defaultValue={lead.ownerId ?? ""}
          className="input"
        >
          <option value="">Me</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Notes</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={lead.notes ?? ""}
          className="input"
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? (
            <>
              <Spinner /> Saving…
            </>
          ) : (
            submitLabel
          )}
        </button>
        {state?.error && (
          <span className="text-sm text-clay">{state.error}</span>
        )}
        {state?.ok && <span className="text-sm text-olive">{state.ok}</span>}
      </div>
    </form>
  );
}
