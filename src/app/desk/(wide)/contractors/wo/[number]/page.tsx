import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { contractorBills, db, workOrders } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { date, money } from "@/lib/format";
import { scopedProject } from "@/lib/site-ops";
import { ActionForm } from "@/components/action-form";
import { PrintButton } from "@/components/print-button";
import { Empty, StatusBadge } from "@/components/ui";
import { submitBill, updateWorkOrder, approveBill, payBill, rejectBill } from "../../actions";

export default async function WorkOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const user = await requireUser("contractors");
  const wo = await db.query.workOrders.findFirst({
    where: eq(workOrders.number, decodeURIComponent(number)),
    with: { contractor: true, stage: true, bills: { orderBy: asc(contractorBills.createdAt), with: { submittedBy: true } } },
  });
  if (!wo) notFound();
  const project = await scopedProject(user, wo.projectId);
  if (!project) notFound();
  const approver = can(user.role, "approve");
  const cur = wo.currency;
  const live = wo.bills.filter((b) => b.status !== "REJECTED");
  const billed = live.reduce((a, b) => a + b.amount, 0);
  const paid = wo.bills.filter((b) => b.status === "PAID").reduce((a, b) => a + b.amount, 0);

  return (
    <div className="grid gap-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/desk/contractors/${wo.contractorId}`} className="text-xs font-semibold text-muted hover:text-ink">
            ← {wo.contractor.name}
          </Link>
          <h1 className="h-display text-3xl">{wo.number}</h1>
        </div>
        <PrintButton />
      </div>

      <section className="card p-5 print:border-0 print:shadow-none">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="h-display text-2xl">Zukhti Home</p>
            <p className="text-xs text-muted">{project.office.name}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">Work order {wo.number}</p>
            <p className="text-muted">{date(wo.createdAt)}</p>
            <p className="no-print mt-1">
              <StatusBadge status={wo.status} />
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="label">Contractor</p>
            <p className="font-semibold">{wo.contractor.name}</p>
            <p>{wo.contractor.trade}</p>
            {wo.contractor.phone && <p>{wo.contractor.phone}</p>}
          </div>
          <div>
            <p className="label">Site</p>
            <p className="font-semibold">{project.name}</p>
            {project.siteAddress && <p>{project.siteAddress}</p>}
            {wo.stage && <p>Stage: {wo.stage.name}</p>}
          </div>
        </div>
        <div className="mt-4">
          <p className="label">Work</p>
          <p className="font-semibold">{wo.title}</p>
          {wo.scope && <p className="mt-1 whitespace-pre-line text-sm">{wo.scope}</p>}
        </div>
        <div className="mt-4 flex justify-between border-t border-line pt-3 text-base">
          <span className="font-semibold">Agreed amount</span>
          <span className="h-display text-2xl">{money(wo.amount, cur)}</span>
        </div>
        <div className="mt-10 hidden grid-cols-2 gap-10 text-xs text-muted print:grid">
          <p className="border-t border-line pt-1">For Zukhti Home</p>
          <p className="border-t border-line pt-1">Accepted by contractor</p>
        </div>
      </section>

      <div className="no-print grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="card p-4">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
            <p className="label mb-0">Running bills</p>
            <p>
              Billed {money(billed, cur)} of {money(wo.amount, cur)} · paid {money(paid, cur)}
            </p>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-line/70">
            <div className="h-full bg-olive" style={{ width: `${Math.min(100, wo.amount ? (billed / wo.amount) * 100 : 0)}%` }} />
          </div>
          {!wo.bills.length && <Empty>No bills yet.</Empty>}
          <ul className="divide-y divide-line">
            {wo.bills.map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <p className="font-semibold">
                    RA {i + 1} · {money(b.amount, cur)}
                  </p>
                  <p className="text-xs text-muted">
                    {date(b.createdAt)}
                    {b.submittedBy ? ` · by ${b.submittedBy.name}` : ""}
                    {b.note ? ` · ${b.note}` : ""}
                    {b.reference ? ` · ref ${b.reference}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {b.billUrl && (
                    <a href={b.billUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brass underline">
                      Bill
                    </a>
                  )}
                  <StatusBadge status={b.status} />
                  {approver && (b.status === "PENDING" || b.status === "APPROVED") && (
                    <form action={b.status === "PENDING" ? approveBill : payBill} className="flex gap-1">
                      <input type="hidden" name="id" value={b.id} />
                      {b.status === "PENDING" ? (
                        <>
                          <button className="btn-primary px-2.5 py-1 text-xs">
                            Approve
                          </button>
                          <input name="reason" placeholder="Reason" className="input w-24 py-1 text-xs" />
                          <button formAction={rejectBill} className="btn-ghost px-2.5 py-1 text-xs text-clay">
                            Reject
                          </button>
                        </>
                      ) : (
                        <>
                          <input name="reference" placeholder="UTR / cheque" className="input w-28 py-1 text-xs" />
                          <button className="btn-brass px-2.5 py-1 text-xs">
                            Mark paid
                          </button>
                        </>
                      )}
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid content-start gap-5">
          {wo.status !== "CANCELLED" && (
            <section className="card p-4">
              <p className="label">Submit a running bill</p>
              <ActionForm action={submitBill} submitLabel="Submit bill">
                <input type="hidden" name="workOrderId" value={wo.id} />
                <div>
                  <label className="label">Amount ({cur})</label>
                  <input name="amount" type="number" step="0.01" min="0" max={Math.max(0, wo.amount - billed)} required className="input" />
                  <p className="mt-1 text-xs text-muted">Up to {money(Math.max(0, wo.amount - billed), cur)} remaining</p>
                </div>
                <div>
                  <label className="label">Work covered</label>
                  <input name="note" className="input" placeholder="e.g. 3 wardrobes carcass done" />
                </div>
                <div>
                  <label className="label">Bill photo (optional)</label>
                  <input name="bill" type="file" accept="image/*,application/pdf" capture="environment" className="text-sm" />
                </div>
              </ActionForm>
            </section>
          )}
          {approver && (
            <section className="card p-4">
              <p className="label">Revise work order</p>
              <form action={updateWorkOrder} className="grid gap-3">
                <input type="hidden" name="id" value={wo.id} />
                <div>
                  <label className="label">Agreed amount ({cur})</label>
                  <input name="amount" type="number" step="0.01" min={billed} defaultValue={wo.amount} className="input" />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select name="status" defaultValue={wo.status} className="input">
                    <option value="OPEN">Open</option>
                    <option value="DONE">Done</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
                <button className="btn-ghost">Save</button>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
