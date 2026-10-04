"use client";

import { useMemo, useState, useTransition } from "react";
import { createPo } from "../actions";
import { CURRENCIES, convert } from "@/lib/fx";
import type { FxRates } from "@/lib/settings";

type Line = { id: string; room: string; description: string; unit: string; qty: number; unitCost: number; ordered: number };
type Project = { id: string; name: string; currency: string; lines: Line[] };
type Vendor = { id: string; name: string; currency: string; leadTimeDays: number | null };
type Row = { key: string; boqItemId: string | null; item: string; qty: number; unit: string; unitCost: number; on: boolean; ordered?: number; planned?: number };

const fmt = (n: number, c: string) => `${c} ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function PoBuilder({ projects, vendors, fx, initialProjectId }: { projects: Project[]; vendors: Vendor[]; fx: FxRates; initialProjectId: string }) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const vendor = vendors.find((v) => v.id === vendorId);
  const [currency, setCurrency] = useState(vendor?.currency ?? "CNY");
  const project = projects.find((p) => p.id === projectId);
  const [eta, setEta] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toVendor = (amount: number, from: string) => {
    try {
      return Math.round(convert(fx, amount, from, currency) * 100) / 100;
    } catch {
      return amount;
    }
  };
  const buildRows = (p: Project | undefined): Row[] =>
    (p?.lines ?? []).map((l) => ({
      key: l.id,
      boqItemId: l.id,
      item: `${l.room}: ${l.description}`,
      qty: Math.max(0, Math.round((l.qty - l.ordered) * 100) / 100),
      unit: l.unit,
      unitCost: toVendor(l.unitCost, p!.currency),
      on: false,
      ordered: l.ordered,
      planned: l.qty,
    }));
  const [rows, setRows] = useState<Row[]>(() => buildRows(project));
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const chosen = rows.filter((r) => r.on && r.qty > 0);
  const total = chosen.reduce((a, r) => a + r.qty * r.unitCost, 0);
  const totalProject = useMemo(() => {
    try {
      return project ? convert(fx, total, currency, project.currency) : 0;
    } catch {
      return null;
    }
  }, [fx, total, currency, project]);

  function submit() {
    setError(null);
    start(async () => {
      const res = await createPo({
        projectId,
        vendorId,
        currency,
        eta: eta || undefined,
        notes: notes || undefined,
        lines: chosen.map((r) => ({ boqItemId: r.boqItemId, item: r.item, qty: r.qty, unit: r.unit, unitCost: r.unitCost })),
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="card grid gap-3 p-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Project</label>
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setRows(buildRows(projects.find((p) => p.id === e.target.value)));
            }}
            className="input"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Vendor</label>
          <select
            value={vendorId}
            onChange={(e) => {
              setVendorId(e.target.value);
              const v = vendors.find((x) => x.id === e.target.value);
              if (v) setCurrency(v.currency);
            }}
            className="input"
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Expected delivery</label>
          <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className="input" />
          {!eta && vendor?.leadTimeDays ? <p className="mt-1 text-xs text-muted">Default: {vendor.leadTimeDays} days</p> : null}
        </div>
        <div className="sm:col-span-3">
          <label className="label">Notes for vendor</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Finish, packing, delivery address…" className="input" />
        </div>
      </div>

      <div className="card overflow-x-auto p-2">
        {!rows.length && <p className="p-4 text-sm text-muted">This project has no BOQ lines. Add a custom line below.</p>}
        {rows.length > 0 && (
          <table className="table-clean">
            <thead>
              <tr>
                <th />
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th>Unit</th>
                <th className="text-right">Unit cost ({currency})</th>
                <th className="text-right">Line</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.on ? "" : "opacity-60"}>
                  <td>
                    <input type="checkbox" checked={r.on} onChange={(e) => patch(r.key, { on: e.target.checked })} aria-label="Include" />
                  </td>
                  <td className="min-w-56">
                    <input value={r.item} onChange={(e) => patch(r.key, { item: e.target.value })} className="input py-1.5" />
                    {r.planned != null && (
                      <p className="mt-0.5 text-xs text-muted">
                        BOQ {r.planned} · already ordered {r.ordered}
                      </p>
                    )}
                  </td>
                  <td>
                    <input type="number" step="0.01" min={0} value={r.qty} onChange={(e) => patch(r.key, { qty: Number(e.target.value), on: true })} className="input w-24 py-1.5 text-right" />
                  </td>
                  <td>
                    <input value={r.unit} onChange={(e) => patch(r.key, { unit: e.target.value })} className="input w-20 py-1.5" />
                  </td>
                  <td>
                    <input type="number" step="0.01" min={0} value={r.unitCost} onChange={(e) => patch(r.key, { unitCost: Number(e.target.value), on: true })} className="input w-32 py-1.5 text-right" />
                  </td>
                  <td className="whitespace-nowrap text-right font-semibold">{fmt(r.qty * r.unitCost, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { key: crypto.randomUUID(), boqItemId: null, item: "", qty: 1, unit: "nos", unitCost: 0, on: true }])}
          className="m-2 text-xs font-semibold text-brass"
        >
          + Custom line (not in BOQ)
        </button>
      </div>

      <div className="card sticky bottom-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-lg font-bold">{fmt(total, currency)}</p>
          {project && currency !== project.currency && <p className="text-xs text-muted">{totalProject == null ? "Exchange rate missing" : `≈ ${fmt(Math.round(totalProject), project.currency)} at rates as of ${fx.asOf}`}</p>}
          {error && <p className="text-sm text-clay">{error}</p>}
        </div>
        <button onClick={submit} disabled={pending || !chosen.length || !vendorId} className="btn-primary">
          {pending ? "Creating…" : `Create PO (${chosen.length} line${chosen.length === 1 ? "" : "s"})`}
        </button>
      </div>
    </div>
  );
}
