"use client";

import { ErrorNote, Spinner, SuccessNote } from "@/components/feedback";
import { useActionState, useEffect, useRef } from "react";
import { Camera } from "lucide-react";
import { addExpense, type FormState } from "./actions";

export function ExpenseForm({
  projects,
  categories,
  defaultProject,
}: {
  projects: { id: string; name: string; currency: string }[];
  categories: readonly string[];
  defaultProject?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    addExpense,
    undefined,
  );
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state?.at, state?.ok]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Project</label>
        <select
          name="projectId"
          defaultValue={defaultProject ?? projects[0]?.id}
          className="input"
          required
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.currency})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Amount</label>
        <input
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          required
          className="input text-lg"
          placeholder="0"
        />
      </div>
      <div>
        <label className="label">Category</label>
        <select name="category" className="input">
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">What for</label>
        <input
          name="description"
          required
          className="input"
          placeholder="e.g. 20 bags white cement, tempo from Kurla"
        />
      </div>
      <div>
        <label className="label">Paid to (optional)</label>
        <input name="paidTo" className="input" placeholder="Shop / person" />
      </div>
      <div>
        <label className="label">Date</label>
        <input
          name="spentOn"
          type="date"
          defaultValue={today}
          max={today}
          className="input"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-3 text-sm text-muted hover:border-brass sm:col-span-2">
        <Camera size={20} />
        <span className="flex-1">Photo of the bill or receipt</span>
        <input
          name="bill"
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="max-w-[55%] text-xs"
        />
      </label>
      {state?.error && (
        <ErrorNote
          key={state.error + String((state as { at?: number }).at ?? "")}
          className="sm:col-span-2"
        >
          {state.error}
        </ErrorNote>
      )}
      {state?.ok && (
        <SuccessNote
          key={state.ok + String((state as { at?: number }).at ?? "")}
          className="sm:col-span-2"
        >
          {state.ok}
        </SuccessNote>
      )}
      <button className="btn-primary py-3 sm:col-span-2" disabled={pending}>
        {pending ? (
          <>
            <Spinner /> Saving…
          </>
        ) : (
          "Save expense"
        )}
      </button>
    </form>
  );
}
