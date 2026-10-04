"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDraftLines,
  draftBoqAction,
  type DraftState,
} from "../../ai-actions";

type Line = {
  room: string;
  rateItemId: string | null;
  description: string;
  unit: string;
  qty: number;
  note?: string;
  keep: boolean;
};
type Rate = { id: string; price: number };

export function AiBoqDraft({
  projectId,
  rates,
  currency,
}: {
  projectId: string;
  rates: Rate[];
  currency: string;
}) {
  const [state, action, pending] = useActionState<DraftState, FormData>(
    draftBoqAction,
    {},
  );
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const price = new Map(rates.map((r) => [r.id, r.price]));

  useEffect(() => {
    if (state.items) {
      setLines(state.items.map((i) => ({ ...i, keep: true })));
      setMsg(null);
    }
  }, [state.at, state.items]);

  const kept = lines.filter((l) => l.keep);
  const total = kept.reduce(
    (a, l) => a + l.qty * (l.rateItemId ? (price.get(l.rateItemId) ?? 0) : 0),
    0,
  );
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  const set = (idx: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const save = () =>
    startSave(async () => {
      const res = await addDraftLines(
        projectId,
        kept.map(({ room, rateItemId, description, unit, qty }) => ({
          room,
          rateItemId,
          description,
          unit,
          qty,
        })),
      );
      if (res.error) setMsg(res.error);
      else {
        setMsg(`Added ${res.added} lines to the BOQ.`);
        setLines([]);
        router.refresh();
      }
    });

  return (
    <div className="grid gap-2">
      {msg && (
        <p className="rounded-xl bg-olive-soft px-4 py-2 text-sm text-olive">
          {msg}
        </p>
      )}
      <details
        className="card p-4"
        open={!!lines.length || !!state.error || pending}
      >
        <summary className="cursor-pointer font-semibold">
          ✨ Draft BOQ with AI{" "}
          <span className="text-sm font-normal text-muted">
            — from a brief or floor plan
          </span>
        </summary>
        <form action={action} className="mt-3 grid gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <div>
            <label className="label">Brief</label>
            <textarea
              name="brief"
              rows={3}
              className="input"
              placeholder="e.g. 3BHK, 1450 sqft carpet. Full false ceiling in living and bedrooms, modular kitchen 14 ft L-shape, wardrobes in 3 bedrooms 7×8 ft, TV unit, full repaint, lights."
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Floor plan (optional)</label>
              <input
                name="plan"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="text-sm"
              />
            </div>
            <button className="btn-brass" disabled={pending}>
              {pending ? "Drafting… (up to a minute)" : "Draft lines"}
            </button>
          </div>
          {state.error && <p className="text-sm text-clay">{state.error}</p>}
        </form>

        {!!lines.length && (
          <div className="mt-4 grid gap-2">
            {!!state.assumptions?.length && (
              <div className="rounded-xl bg-brass/10 p-3 text-sm">
                <p className="font-semibold">Check these assumptions</p>
                <ul className="ml-4 list-disc">
                  {state.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {lines.map((l, i) => (
              <div
                key={i}
                className={`grid grid-cols-[auto_1fr] items-center gap-2 rounded-xl border border-line p-2 text-sm md:grid-cols-[auto_1fr_2.4fr_0.8fr_0.6fr_1fr] ${l.keep ? "" : "opacity-50"}`}
              >
                <input
                  type="checkbox"
                  checked={l.keep}
                  onChange={(e) => set(i, { keep: e.target.checked })}
                  aria-label="Keep line"
                />
                <input
                  value={l.room}
                  onChange={(e) => set(i, { room: e.target.value })}
                  className="input py-1.5"
                  aria-label="Room"
                />
                <div className="col-span-2 md:col-span-1">
                  <input
                    value={l.description}
                    onChange={(e) => set(i, { description: e.target.value })}
                    className="input py-1.5"
                    aria-label="Item"
                  />
                  {l.note && (
                    <p className="mt-0.5 text-xs text-muted">{l.note}</p>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={l.qty}
                  onChange={(e) => set(i, { qty: Number(e.target.value) })}
                  className="input py-1.5"
                  aria-label="Qty"
                />
                <span className="text-muted">{l.unit}</span>
                <span className="text-right">
                  {l.rateItemId ? (
                    fmt(l.qty * (price.get(l.rateItemId) ?? 0))
                  ) : (
                    <span className="text-xs text-clay">
                      Custom — price after adding
                    </span>
                  )}
                </span>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="text-sm">
                {kept.length} of {lines.length} lines · approx.{" "}
                <b>{fmt(total)}</b> before tax
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setLines([])}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || !kept.length}
                  onClick={save}
                >
                  {saving ? "Adding…" : `Add ${kept.length} lines to BOQ`}
                </button>
              </div>
            </div>
          </div>
        )}
      </details>
    </div>
  );
}
