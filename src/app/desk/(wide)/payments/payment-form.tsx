"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { recordPayment, type FormState } from "./actions";

type Person = { id: string; name: string; trade: string; phone: string | null };
type Project = { id: string; name: string; currency: string; active: boolean };
type Wo = { id: string; number: string; title: string; contractorId: string; projectId: string; bills: { id: string; amount: number; note: string | null }[] };

const KINDS = [
  ["ADVANCE", "Advance"],
  ["WAGES", "Wages / daily labour"],
  ["BILL", "Against an approved bill"],
  ["OTHER", "Other"],
] as const;
const MODES = ["UPI", "Bank transfer", "Cash", "Cheque"];

export function PaymentForm({ people, projects, wos, initialPerson, paidBefore }: { people: Person[]; projects: Project[]; wos: Wo[]; initialPerson?: string; paidBefore: { contractorId: string; projectId: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recordPayment, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const [person, setPerson] = useState(initialPerson && people.some((p) => p.id === initialPerson) ? initialPerson : (people[0]?.id ?? ""));
  const theirProjects = useMemo(() => {
    // Projects this person works on first, then live projects, handed-over ones last.
    const theirs = new Set([...wos.filter((w) => w.contractorId === person).map((w) => w.projectId), ...paidBefore.filter((p) => p.contractorId === person).map((p) => p.projectId)]);
    const score = (p: Project) => (theirs.has(p.id) ? 2 : 0) + (p.active ? 1 : 0);
    return [...projects].sort((a, b) => score(b) - score(a));
  }, [person, projects, wos, paidBefore]);
  const [project, setProject] = useState(theirProjects[0]?.id ?? "");
  const [kind, setKind] = useState<string>("ADVANCE");
  const [wo, setWo] = useState("");
  const [bill, setBill] = useState("");
  const [amount, setAmount] = useState("");
  const options = wos.filter((w) => w.contractorId === person && w.projectId === project);
  const bills = options.flatMap((w) => w.bills.map((b) => ({ ...b, wo: w })));
  const cur = projects.find((p) => p.id === project)?.currency ?? "";
  const who = people.find((p) => p.id === person);

  useEffect(() => {
    setProject(theirProjects[0]?.id ?? "");
  }, [person, theirProjects]);
  useEffect(() => {
    setWo("");
    setBill("");
  }, [person, project]);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setAmount("");
      setBill("");
    }
  }, [state?.at, state?.ok]);

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Paid to</label>
        <select name="contractorId" value={person} onChange={(e) => setPerson(e.target.value)} className="input">
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.trade}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">For project</label>
        <select name="projectId" value={project} onChange={(e) => setProject(e.target.value)} className="input">
          {theirProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Type</label>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input">
          {KINDS.map(([v, l]) => (
            <option key={v} value={v} disabled={v === "BILL" && !bills.length}>
              {l}
              {v === "BILL" && !bills.length ? " (none approved)" : ""}
            </option>
          ))}
        </select>
      </div>
      {kind === "BILL" ? (
        <div>
          <label className="label">Bill</label>
          <select
            name="billId"
            value={bill}
            onChange={(e) => {
              setBill(e.target.value);
              const b = bills.find((x) => x.id === e.target.value);
              if (b) setAmount(String(b.amount));
            }}
            className="input"
            required
          >
            <option value="">Choose…</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.wo.number} · {cur} {b.amount.toLocaleString("en-IN")}
                {b.note ? ` · ${b.note}` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="label">Work order (optional)</label>
          <select name="workOrderId" value={wo} onChange={(e) => setWo(e.target.value)} className="input">
            <option value="">—</option>
            {options.map((w) => (
              <option key={w.id} value={w.id}>
                {w.number} · {w.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label">Amount {cur && `(${cur})`}</label>
        <input name="amount" type="number" inputMode="decimal" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input text-lg" />
      </div>
      <div>
        <label className="label">Paid by</label>
        <select name="mode" className="input">
          {MODES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Reference</label>
        <input name="reference" className="input" placeholder="UTR / UPI ref / cheque no." />
      </div>
      <div>
        <label className="label">Date</label>
        <input name="paidOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Note</label>
        <input name="note" className="input" placeholder="e.g. 6 days × 2 helpers, week of 28 Sep" />
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-3 text-sm text-muted hover:border-brass sm:col-span-2">
        <Camera size={20} />
        <span className="flex-1">Screenshot or receipt (optional)</span>
        <input name="receipt" type="file" accept="image/*,application/pdf" className="max-w-[55%] text-xs" />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="notify" className="h-4 w-4" disabled={!who?.phone} />
        Send {who?.name.split(" ")[0] ?? "them"} a WhatsApp confirmation{who?.phone ? "" : " (no phone saved)"}
      </label>
      {state?.error && <p className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-clay sm:col-span-2">{state.error}</p>}
      {state?.ok && <p className="rounded-xl bg-olive-soft px-3 py-2 text-sm text-olive sm:col-span-2">{state.ok}</p>}
      <button className="btn-primary py-3 sm:col-span-2" disabled={pending || !people.length || !project}>
        {pending ? "Saving…" : "Record payment"}
      </button>
    </form>
  );
}
