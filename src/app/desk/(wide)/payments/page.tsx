import Link from "next/link";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { contractorPayments, db, workOrders } from "@/db";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { scopedContractors, scopedProjects } from "@/lib/site-ops";
import { Empty, Stat } from "@/components/ui";
import { PaymentForm } from "./payment-form";
import { deletePayment } from "./actions";

const KIND: Record<string, string> = { ADVANCE: "Advance", WAGES: "Wages", BILL: "Bill payment", OTHER: "Other" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ person?: string; project?: string }> }) {
  const user = await requireUser("payouts");
  const { person, project } = await searchParams;
  const [people, projects] = await Promise.all([scopedContractors(user), scopedProjects(user, true)]);
  const ids = projects.map((p) => p.id);
  const [wos, payments] = ids.length
    ? await Promise.all([
        db.query.workOrders.findMany({ where: inArray(workOrders.projectId, ids), with: { bills: true } }),
        db.query.contractorPayments.findMany({
          where: and(inArray(contractorPayments.projectId, ids), person ? eq(contractorPayments.contractorId, person) : undefined, project ? eq(contractorPayments.projectId, project) : undefined),
          with: { contractor: true, project: true, workOrder: true, paidBy: true },
          orderBy: desc(contractorPayments.paidOn),
          limit: 200,
        }),
      ])
    : [[], []];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const thisMonth = ids.length
    ? await db.select({ amount: contractorPayments.amount, currency: contractorPayments.currency, mode: contractorPayments.mode }).from(contractorPayments).where(and(inArray(contractorPayments.projectId, ids), gte(contractorPayments.paidOn, monthStart)))
    : [];
  const sum = (list: { amount: number; currency: string }[]) => {
    const by = new Map<string, number>();
    for (const x of list) by.set(x.currency, (by.get(x.currency) ?? 0) + x.amount);
    return [...by].map(([c, n]) => money(n, c)).join(" + ") || "—";
  };
  const paidBefore = ids.length
    ? await db.selectDistinct({ contractorId: contractorPayments.contractorId, projectId: contractorPayments.projectId }).from(contractorPayments).where(inArray(contractorPayments.projectId, ids)).then((r) => r.filter((x): x is { contractorId: string; projectId: string } => !!x.projectId))
    : [];
  const unpaidBills = wos.flatMap((w) => w.bills.filter((b) => b.status === "APPROVED"));

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="h-display text-3xl">Payments to contractors & labour</h1>
        <p className="text-sm text-muted">Every payout is recorded on that person&apos;s account, against a project. Only the owner and accounts can see this.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Paid this month" value={sum(thisMonth)} hint={`${thisMonth.length} payments`} />
        <Stat label="Cash this month" value={sum(thisMonth.filter((x) => x.mode === "Cash"))} />
        <Stat label="Approved bills unpaid" value={unpaidBills.length} hint={sum(unpaidBills.map((b) => ({ amount: b.amount, currency: wos.find((w) => w.id === b.workOrderId)!.currency })))} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
        <section className="card content-start p-4">
          <p className="label">Record a payment</p>
          {!people.length ? (
            <Empty>
              Add the person first under <Link href="/desk/contractors" className="underline">Contractors</Link> (choose “Labour / helper” for daily workers).
            </Empty>
          ) : (
            <PaymentForm
              initialPerson={person}
              people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, trade: p.trade, phone: p.phone }))}
              projects={projects.map((p) => ({ id: p.id, name: p.name, currency: p.office.currency, active: p.status !== "HANDED_OVER" }))}
              paidBefore={paidBefore}
              wos={wos
                .filter((w) => w.status !== "CANCELLED")
                .map((w) => ({ id: w.id, number: w.number, title: w.title, contractorId: w.contractorId, projectId: w.projectId, bills: w.bills.filter((b) => b.status === "APPROVED").map((b) => ({ id: b.id, amount: b.amount, note: b.note })) }))}
            />
          )}
        </section>

        <section className="grid content-start gap-3">
          <form className="flex flex-wrap items-center gap-2 text-sm">
            <select name="person" defaultValue={person ?? ""} className="input w-auto py-1.5 text-xs" aria-label="Person">
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select name="project" defaultValue={project ?? ""} className="input w-auto py-1.5 text-xs" aria-label="Project">
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="btn-ghost px-3 py-1.5 text-xs">Filter</button>
            {person && (
              <Link href={`/desk/contractors/${person}#ledger`} className="ml-auto text-xs font-semibold text-brass">
                Open their account →
              </Link>
            )}
          </form>
          <p className="text-xs text-muted">
            {payments.length} payment{payments.length === 1 ? "" : "s"} · total {sum(payments)}
          </p>
          {!payments.length && <Empty>No payments recorded yet.</Empty>}
          <ul className="grid gap-2">
            {payments.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {money(p.amount, p.currency)} →{" "}
                    <Link href={`/desk/contractors/${p.contractorId}#ledger`} className="hover:text-brass">
                      {p.contractor.name}
                    </Link>
                  </p>
                  <p className="text-xs text-muted">
                    {KIND[p.kind] ?? p.kind} · {p.project?.name}
                    {p.workOrder ? ` · ${p.workOrder.number}` : ""} · {p.mode}
                    {p.reference ? ` · ref ${p.reference}` : ""} · {date(p.paidOn)} · by {p.paidBy.name}
                  </p>
                  {p.note && <p className="text-xs">{p.note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {p.receiptUrl && (
                    <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brass underline">
                      Receipt
                    </a>
                  )}
                  {user.role === "OWNER" && (
                    <form action={deletePayment}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="text-xs text-muted hover:text-clay" title="Delete (entered by mistake)">
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
