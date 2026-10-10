import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, siteExpenses } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { date, money } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/site-costs";
import { scopedProjects } from "@/lib/site-ops";
import { Empty, Stat, StatusBadge } from "@/components/ui";
import { ExpenseForm } from "./expense-form";
import {
  approveExpense,
  reimburseExpense,
  rejectExpense,
  withdrawExpense,
} from "./actions";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; project?: string }>;
}) {
  const user = await requireUser("expenses");
  const { f, project: projectFilter } = await searchParams;
  const approver = can(user.role, "approve");
  const projects = await scopedProjects(user, approver);
  const ids = projects.map((p) => p.id);
  const all = ids.length
    ? await db.query.siteExpenses.findMany({
        where: and(
          inArray(siteExpenses.projectId, ids),
          projectFilter ? eq(siteExpenses.projectId, projectFilter) : undefined,
        ),
        with: {
          project: { with: { office: true } },
          submittedBy: true,
          reviewedBy: true,
        },
        orderBy: desc(siteExpenses.createdAt),
        limit: 300,
      })
    : [];
  const pending = all.filter((e) => e.status === "PENDING");
  const toReimburse = all.filter((e) => e.status === "APPROVED");
  const mine = all.filter((e) => e.submittedById === user.id);
  const view = f ?? (approver && pending.length ? "pending" : "mine");
  const rows =
    view === "pending"
      ? pending
      : view === "reimburse"
        ? toReimburse
        : view === "all" && approver
          ? all
          : mine;
  const sum = (list: typeof all) => {
    const by = new Map<string, number>();
    for (const e of list)
      by.set(e.currency, (by.get(e.currency) ?? 0) + e.amount);
    return [...by].map(([c, n]) => money(n, c)).join(" + ") || "—";
  };
  const tab = (key: string, label: string) => (
    <Link
      key={key}
      href={`/desk/expenses?f=${key}${projectFilter ? `&project=${projectFilter}` : ""}`}
      className={`rounded-full border px-3 py-1.5 font-semibold ${view === key ? "border-ink bg-ink text-paper" : "border-line text-muted"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="h-display text-3xl">Site expenses</h1>
        <p className="text-sm text-muted">
          Cash spent on site — log it with a photo of the bill.{" "}
          {approver
            ? "You approve and mark reimbursed."
            : "Accounts approves it."}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <section className="card content-start p-4">
          <p className="label">Log an expense</p>
          {projects.length ? (
            <ExpenseForm
              projects={projects
                .filter((p) => p.status !== "HANDED_OVER")
                .map((p) => ({
                  id: p.id,
                  name: p.name,
                  currency: p.office.currency,
                }))}
              categories={EXPENSE_CATEGORIES}
              defaultProject={projectFilter}
            />
          ) : (
            <Empty>No active projects.</Empty>
          )}
        </section>

        <div className="grid content-start gap-4">
          {approver && (
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="To approve"
                value={pending.length}
                hint={sum(pending)}
              />
              <Stat
                label="To reimburse"
                value={toReimburse.length}
                hint={sum(toReimburse)}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {approver && tab("pending", `To approve (${pending.length})`)}
            {approver &&
              tab("reimburse", `To reimburse (${toReimburse.length})`)}
            {tab("mine", `Mine (${mine.length})`)}
            {approver && tab("all", "All")}
            <form className="ml-auto flex min-w-0 max-w-full items-center">
              <input type="hidden" name="f" value={view} />
              <select
                name="project"
                defaultValue={projectFilter ?? ""}
                className="input py-1.5 text-xs"
                aria-label="Filter by project"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="btn-ghost ml-1 px-2 py-1.5 text-xs">
                Filter
              </button>
            </form>
          </div>

          {!rows.length && <Empty>Nothing here.</Empty>}
          <ul className="grid gap-2">
            {rows.map((e) => {
              const canReview =
                approver &&
                (e.submittedById !== user.id || user.role === "OWNER");
              return (
                <li key={e.id} className="card p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {money(e.amount, e.currency)} · {e.description}
                      </p>
                      <p className="text-xs text-muted">
                        {e.project.name} · {e.category}
                        {e.paidTo ? ` · paid to ${e.paidTo}` : ""} ·{" "}
                        {date(e.spentOn)} · by {e.submittedBy.name}
                      </p>
                      {e.reviewNote && (
                        <p className="mt-1 text-xs">Note: {e.reviewNote}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {e.billUrl ? (
                        <a
                          href={e.billUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-brass underline"
                        >
                          Bill
                        </a>
                      ) : (
                        <span className="text-xs text-clay">No bill</span>
                      )}
                      <StatusBadge
                        status={e.status === "PAID" ? "REIMBURSED" : e.status}
                      />
                    </div>
                  </div>
                  {canReview && e.status === "PENDING" && (
                    <form
                      action={approveExpense}
                      className="mt-2 flex flex-wrap gap-2"
                    >
                      <input type="hidden" name="id" value={e.id} />
                      <input
                        name="note"
                        placeholder="Note (optional)"
                        className="input flex-1 py-1.5 text-xs"
                      />
                      <button className="btn-primary px-3 py-1.5 text-xs">
                        Approve
                      </button>
                      <button
                        formAction={rejectExpense}
                        className="btn-ghost px-3 py-1.5 text-xs text-clay"
                      >
                        Reject
                      </button>
                    </form>
                  )}
                  {canReview && e.status === "APPROVED" && (
                    <form
                      action={reimburseExpense}
                      className="mt-2 flex justify-end"
                    >
                      <input type="hidden" name="id" value={e.id} />
                      <button className="btn-ghost px-3 py-1.5 text-xs">
                        Mark reimbursed
                      </button>
                    </form>
                  )}
                  {e.submittedById === user.id && e.status === "PENDING" && (
                    <form
                      action={withdrawExpense}
                      className="mt-2 flex justify-end"
                    >
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-xs text-muted underline">
                        Withdraw
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
