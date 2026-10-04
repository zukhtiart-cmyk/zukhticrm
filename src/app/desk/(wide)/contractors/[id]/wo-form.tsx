"use client";

import { useActionState, useState } from "react";
import { createWorkOrder, type FormState } from "../actions";

type P = { id: string; name: string; currency: string; stages: { id: string; name: string }[] };

export function WorkOrderForm({ contractorId, projects }: { contractorId: string; projects: P[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createWorkOrder, undefined);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const project = projects.find((p) => p.id === projectId);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="contractorId" value={contractorId} />
      <div>
        <label className="label">Project</label>
        <select name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Stage (optional)</label>
        <select name="stageId" className="input" key={projectId}>
          <option value="">—</option>
          {project?.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Work</label>
        <input name="title" required className="input" placeholder="e.g. Wardrobes — master & kids bedroom (labour)" />
      </div>
      <div>
        <label className="label">Scope and terms</label>
        <textarea name="scope" rows={3} className="input" placeholder="Measurements, inclusions, material by Zukhti, timeline, payment terms…" />
      </div>
      <div>
        <label className="label">Agreed amount {project ? `(${project.currency})` : ""}</label>
        <input name="amount" type="number" step="0.01" min="0" required className="input" />
      </div>
      {state?.error && <p className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-clay">{state.error}</p>}
      <button className="btn-brass" disabled={pending || !projects.length}>
        {pending ? "Creating…" : "Create work order"}
      </button>
    </form>
  );
}
