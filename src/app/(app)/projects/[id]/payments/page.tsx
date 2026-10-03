import { can } from "@/lib/permissions";
import { date, dateInput, money, round2 } from "@/lib/format";
import { Empty, Section, StatusBadge } from "@/components/ui";
import { loadProject } from "../../data";
import { addMilestone, markInvoiced, recordPayment, undoPayment, updateMilestone } from "../../money-actions";

export default async function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await loadProject(id);
  const edit = can(user.role, "payments");
  const cur = project.office.currency;
  const contract = round2(project.boqItems.reduce((a, i) => a + i.qty * i.unitPrice, 0) * (1 + project.office.taxRate / 100));
  const paid = project.milestones.reduce((a, m) => a + (m.status === "PAID" ? (m.paidAmount ?? m.amount) : 0), 0);
  const totalPct = project.milestones.reduce((a, m) => a + m.percent, 0);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="card p-4">
          <p className="label">Contract value</p>
          <p className="h-display text-2xl">{money(contract, cur)}</p>
          <p className="text-xs text-muted">From BOQ incl. {project.office.taxLabel}</p>
        </div>
        <div className="card p-4">
          <p className="label">Received</p>
          <p className="h-display text-2xl text-olive">{money(paid, cur)}</p>
        </div>
        <div className="card p-4">
          <p className="label">Outstanding</p>
          <p className="h-display text-2xl">{money(Math.max(0, contract - paid), cur)}</p>
        </div>
      </div>
      {totalPct !== 100 && project.milestones.length > 0 && (
        <p className="rounded-xl bg-clay-soft px-4 py-2 text-sm text-clay">Milestones add up to {totalPct}% — they should total 100%.</p>
      )}

      <Section title="Payment milestones">
        {!project.milestones.length && <Empty>No milestones.</Empty>}
        <div className="grid gap-3">
          {project.milestones.map((m) => (
            <div key={m.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{m.label}</p>
                  <p className="text-xs text-muted">
                    {m.percent}% · {m.dueStage ? `due at ${m.dueStage.name}` : "due on booking"}
                    {m.status === "PAID" && ` · paid ${date(m.paidAt)}${m.reference ? ` (${m.reference})` : ""}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold">{money(m.status === "PAID" ? (m.paidAmount ?? m.amount) : m.amount, cur)}</span>
                  <StatusBadge status={m.status} />
                </div>
              </div>
              {edit && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-brass">{m.status === "PAID" ? "Edit" : "Record payment / edit"}</summary>
                  <div className="mt-2 grid gap-3">
                    {m.status !== "PAID" ? (
                      <form action={recordPayment} className="grid items-end gap-2 sm:grid-cols-4">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="id" value={m.id} />
                        <div>
                          <label className="label">Amount received</label>
                          <input name="paidAmount" type="number" step="0.01" defaultValue={m.amount} className="input" />
                        </div>
                        <div>
                          <label className="label">Date</label>
                          <input name="paidAt" type="date" defaultValue={dateInput(new Date())} className="input" />
                        </div>
                        <div>
                          <label className="label">Reference</label>
                          <input name="reference" placeholder="NEFT / cheque no." className="input" />
                        </div>
                        <div className="flex gap-2">
                          <button className="btn-primary">Mark paid</button>
                          {m.status === "PENDING" && (
                            <button formAction={markInvoiced} className="btn-ghost">
                              Invoiced
                            </button>
                          )}
                        </div>
                      </form>
                    ) : (
                      <form action={undoPayment}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="id" value={m.id} />
                        <button className="btn-danger py-1.5 text-xs">Undo payment</button>
                      </form>
                    )}
                    <form action={updateMilestone} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <div>
                        <label className="label">Label</label>
                        <input name="label" defaultValue={m.label} className="input" />
                      </div>
                      <div>
                        <label className="label">%</label>
                        <input name="percent" type="number" step="0.01" defaultValue={m.percent} className="input" />
                      </div>
                      <div>
                        <label className="label">Due at stage</label>
                        <select name="dueStageId" defaultValue={m.dueStageId ?? ""} className="input">
                          <option value="">On booking</option>
                          {project.stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button className="btn-ghost">Save</button>
                    </form>
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
        {edit && (
          <form action={addMilestone} className="mt-4 grid items-end gap-2 border-t border-line pt-4 sm:grid-cols-[2fr_1fr_auto]">
            <input type="hidden" name="projectId" value={project.id} />
            <div>
              <label className="label">New milestone</label>
              <input name="label" placeholder="e.g. Variation order" className="input" />
            </div>
            <div>
              <label className="label">%</label>
              <input name="percent" type="number" step="0.01" className="input" />
            </div>
            <button className="btn-ghost">Add</button>
          </form>
        )}
      </Section>
    </div>
  );
}
