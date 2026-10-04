import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, siteExpenses, workOrders } from "@/db";
import { can } from "@/lib/permissions";
import { date, money } from "@/lib/format";
import { projectCosts } from "@/lib/site-costs";
import { Empty, Section, StatusBadge } from "@/components/ui";
import { loadProject } from "../../data";

export default async function CostsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await loadProject(id);
  if (!can(user.role, "boq") && !can(user.role, "approve")) notFound();
  const cur = project.office.currency;
  const [c, expenses, wos] = await Promise.all([
    projectCosts(project.id),
    db.query.siteExpenses.findMany({ where: eq(siteExpenses.projectId, project.id), with: { submittedBy: true }, orderBy: desc(siteExpenses.spentOn) }),
    db.query.workOrders.findMany({ where: eq(workOrders.projectId, project.id), with: { contractor: true, bills: true }, orderBy: desc(workOrders.createdAt) }),
  ]);
  const used = Math.min(100, c.usedPct);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="label">Budget (BOQ cost)</p>
          <p className="h-display text-2xl">{money(c.budget, cur)}</p>
        </div>
        <div className="card p-4">
          <p className="label">Committed</p>
          <p className={`h-display text-2xl ${c.overrun ? "text-clay" : ""}`}>{money(c.committed, cur)}</p>
          <p className="text-xs text-muted">{c.usedPct}% of budget · project {project.progress}% done</p>
        </div>
        <div className="card p-4">
          <p className="label">Pending approval</p>
          <p className="h-display text-2xl">{money(c.expensesPending, cur)}</p>
          <p className="text-xs text-muted">site expenses</p>
        </div>
        <div className="card p-4">
          <p className="label">Projected margin</p>
          <p className={`h-display text-2xl ${c.projectedMarginPct < 20 ? "text-clay" : "text-olive"}`}>{c.projectedMarginPct}%</p>
          <p className="text-xs text-muted">sell vs the higher of budget and committed</p>
        </div>
      </div>

      <Section title="Where the money is going">
        <div className="mb-3 h-3 overflow-hidden rounded-full bg-line/70">
          <div className={`h-full ${c.overrun ? "bg-clay" : c.usedPct > project.progress + 15 ? "bg-brass" : "bg-olive"}`} style={{ width: `${used}%` }} />
        </div>
        {c.overrun && <p className="mb-3 rounded-xl bg-clay-soft px-3 py-2 text-sm text-clay">Committed cost is over the BOQ budget by {money(c.committed - c.budget, cur)}.</p>}
        {!c.overrun && c.usedPct > project.progress + 15 && (
          <p className="mb-3 rounded-xl bg-brass-soft px-3 py-2 text-sm text-brass">Spending ({c.usedPct}% of budget) is running ahead of progress ({project.progress}%).</p>
        )}
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-xl bg-ivory p-3">
            <dt className="text-xs text-muted">Purchase orders</dt>
            <dd className="font-semibold">{money(c.purchase, cur)}</dd>
          </div>
          <div className="rounded-xl bg-ivory p-3">
            <dt className="text-xs text-muted">Contractors (agreed)</dt>
            <dd className="font-semibold">{money(c.contractorCommitted, cur)}</dd>
            <dd className="text-xs text-muted">
              billed {money(c.contractorBilled, cur)}
              {can(user.role, "payouts") && <> · paid {money(c.contractorPaid, cur)}</>}
              {c.directLabour > 0 && <> · incl. {money(c.directLabour, cur)} direct labour</>}
            </dd>
          </div>
          <div className="rounded-xl bg-ivory p-3">
            <dt className="text-xs text-muted">Site expenses (approved)</dt>
            <dd className="font-semibold">{money(c.expensesApproved, cur)}</dd>
          </div>
        </dl>
      </Section>

      <Section
        title={`Contractor work orders (${wos.length})`}
        actions={
          <Link href="/desk/contractors" className="text-xs font-semibold text-brass">
            Contractors →
          </Link>
        }
      >
        {!wos.length && <Empty>No work orders. Raise them from a contractor&apos;s page.</Empty>}
        <ul className="divide-y divide-line">
          {wos.map((w) => {
            const billed = w.bills.filter((b) => b.status === "APPROVED" || b.status === "PAID").reduce((a, b) => a + b.amount, 0);
            const pending = w.bills.filter((b) => b.status === "PENDING").length;
            return (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <Link href={`/desk/contractors/wo/${w.number}`} className="font-semibold hover:text-brass">
                    {w.number} · {w.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {w.contractor.name} ({w.contractor.trade}) · billed {money(billed, w.currency)} of {money(w.amount, w.currency)}
                    {pending ? ` · ${pending} bill${pending > 1 ? "s" : ""} to approve` : ""}
                  </p>
                </div>
                <StatusBadge status={w.status} />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title={`Site expenses (${expenses.length})`}
        actions={
          <Link href={`/desk/expenses?project=${project.id}&f=${can(user.role, "approve") ? "all" : "mine"}`} className="text-xs font-semibold text-brass">
            Log or approve →
          </Link>
        }
      >
        {!expenses.length && <Empty>No site expenses logged.</Empty>}
        <ul className="divide-y divide-line">
          {expenses.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p>
                  <span className="font-semibold">{money(e.amount, e.currency)}</span> · {e.description}
                </p>
                <p className="text-xs text-muted">
                  {e.category} · {date(e.spentOn)} · {e.submittedBy.name}
                  {e.billUrl && (
                    <>
                      {" · "}
                      <a href={e.billUrl} target="_blank" rel="noreferrer" className="underline">
                        bill
                      </a>
                    </>
                  )}
                </p>
              </div>
              <StatusBadge status={e.status === "PAID" ? "REIMBURSED" : e.status} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
