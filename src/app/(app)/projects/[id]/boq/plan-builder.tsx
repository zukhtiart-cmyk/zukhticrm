"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlanLines, planSections } from "../../boq-actions";
import type { PlanSection } from "@/lib/boq-library";

type Line = PlanSection["lines"][number];

/** Build BOQ from floor plan: rooms from the plan, each with the standard items and quantities, ready to tick. */
export function PlanBuilder({ projectId, plans, currency }: { projectId: string; plans: { id: string; title: string }[]; currency: string }) {
  const router = useRouter();
  const [designId, setDesignId] = useState(plans[0]?.id ?? "");
  const [sections, setSections] = useState<PlanSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const fmt = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const set = (si: number, li: number, patch: Partial<Line>) =>
    setSections((ss) => ss && ss.map((s, i) => (i !== si ? s : { ...s, lines: s.lines.map((l, j) => (j !== li ? l : { ...l, ...patch })) })));
  const setSec = (si: number, patch: Partial<PlanSection>) => setSections((ss) => ss && ss.map((s, i) => (i === si ? { ...s, ...patch } : s)));

  const ticked = (sections ?? []).flatMap((s) => s.lines.filter((l) => l.ticked));
  const total = ticked.reduce((a, l) => a + l.qty * l.price, 0);

  if (!plans.length)
    return (
      <p className="text-sm text-muted">
        Read a floor plan first (Designs → Floor plan to 3D). Its rooms and the furniture drawn on it fill the BOQ here.
      </p>
    );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label className="label">Floor plan</label>
          <select className="input" value={designId} onChange={(e) => setDesignId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn-brass"
          disabled={loading || !designId}
          onClick={() =>
            startLoad(async () => {
              setError(null);
              setMsg(null);
              const r = await planSections(projectId, designId);
              if (r.error) return setError(r.error);
              setSections(r.sections ?? []);
              setOpen({});
            })
          }
        >
          {loading ? "Reading rooms…" : sections ? "Start again from plan" : "Build BOQ from plan"}
        </button>
      </div>
      {error && <p className="text-sm text-clay">{error}</p>}
      {msg && <p className="text-sm text-olive">{msg}</p>}

      {sections && (
        <>
          <p className="text-xs text-muted">
            Standard picks and the furniture drawn on the plan are ticked. Tick anything else the client wants, change quantities, sizes or rates, then add.
            Quantities from the plan are a starting point — check them on site.
          </p>
          <div className="grid gap-2">
            {sections.map((s, si) => {
              const on = s.lines.filter((l) => l.ticked);
              const isOpen = open[si] ?? si < 2;
              return (
                <div key={si} className="rounded-xl border border-line">
                  <div className="flex flex-wrap items-center gap-2 p-2">
                    <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen((o) => ({ ...o, [si]: !isOpen }))} aria-label="Show items">
                      {isOpen ? "▾" : "▸"}
                    </button>
                    <input className="input w-48 py-1 font-semibold" value={s.room} onChange={(e) => setSec(si, { room: e.target.value })} aria-label="Room name" />
                    <input className="input w-32 py-1" value={s.size} placeholder="Size" onChange={(e) => setSec(si, { size: e.target.value })} aria-label="Room size" />
                    <span className="ml-auto text-xs text-muted">
                      {on.length} of {s.lines.length} · {fmt(on.reduce((a, l) => a + l.qty * l.price, 0))}
                    </span>
                  </div>
                  {isOpen && (
                    <ul className="divide-y divide-line border-t border-line">
                      {s.lines.map((l, li) => (
                        <li key={li} className={`grid grid-cols-[auto_1fr] items-center gap-2 px-2 py-1.5 text-sm md:grid-cols-[auto_2fr_1fr_0.7fr_0.6fr_0.9fr_0.9fr] ${l.ticked ? "" : "opacity-60"}`}>
                          <input type="checkbox" checked={l.ticked} onChange={(e) => set(si, li, { ticked: e.target.checked })} aria-label={`Include ${l.title}`} />
                          <span title={l.spec}>
                            <b className="text-xs tracking-wide">{l.title}</b>
                            <span className="block truncate text-xs text-muted">{l.spec}</span>
                          </span>
                          <input className="input py-1" value={l.size} placeholder="Size" onChange={(e) => set(si, li, { size: e.target.value })} aria-label="Size" />
                          <input className="input py-1" type="number" step="0.1" value={l.qty} onChange={(e) => set(si, li, { qty: Number(e.target.value) })} aria-label="Qty" />
                          <span className="text-xs text-muted">{l.unit}</span>
                          <input className="input py-1" type="number" step="1" value={l.price} onChange={(e) => set(si, li, { price: Number(e.target.value) })} aria-label="Rate" />
                          <span className="text-right text-xs font-semibold">{fmt(l.qty * l.price)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={saving || !ticked.length}
              onClick={() =>
                startSave(async () => {
                  const picked = sections
                    .map((s) => ({ room: s.room, size: s.size, lines: s.lines.filter((l) => l.ticked).map(({ rateItemId, title, spec, unit, qty, size, price }) => ({ rateItemId, title, spec, unit, qty, size, price })) }))
                    .filter((s) => s.lines.length);
                  const r = await addPlanLines(projectId, picked);
                  setSections(null);
                  setMsg(`Added ${r.added} items to the BOQ.`);
                  router.refresh();
                })
              }
            >
              {saving ? "Adding…" : `Add ${ticked.length} items to BOQ`}
            </button>
            <span className="text-sm font-semibold">{fmt(total)}</span>
            <button type="button" className="btn-ghost text-xs" onClick={() => setSections(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
