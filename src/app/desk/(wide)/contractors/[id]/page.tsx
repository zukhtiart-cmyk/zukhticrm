import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, stages, workOrders } from "@/db";
import { requireUser } from "@/lib/auth";
import { officeScope } from "@/lib/permissions";
import { date, money } from "@/lib/format";
import { findContractor, scopedProjects } from "@/lib/site-ops";
import { ActionForm } from "@/components/action-form";
import { Empty, StatusBadge } from "@/components/ui";
import { ContractorFields } from "../fields";
import { saveContractor } from "../actions";
import { WorkOrderForm } from "./wo-form";

export default async function ContractorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("contractors");
  const c = await findContractor(user, id);
  if (!c) notFound();
  const projects = await scopedProjects(user, true);
  const ids = projects.map((p) => p.id);
  const [wos, offices, projectStages] = await Promise.all([
    ids.length
      ? db.query.workOrders.findMany({ where: eq(workOrders.contractorId, c.id), with: { project: true, bills: true, stage: true }, orderBy: desc(workOrders.createdAt) }).then((l) => l.filter((w) => ids.includes(w.projectId)))
      : [],
    officeScope(user) ? null : db.query.offices.findMany(),
    ids.length ? db.select({ id: stages.id, name: stages.name, projectId: stages.projectId }).from(stages).where(inArray(stages.projectId, ids)).orderBy(asc(stages.order)) : [],
  ]);
  const active = projects.filter((p) => p.status !== "HANDED_OVER");

  return (
    <div className="grid gap-5">
      <div>
        <Link href="/desk/contractors" className="text-xs font-semibold text-muted hover:text-ink">
          ← Contractors
        </Link>
        <h1 className="h-display text-3xl">{c.name}</h1>
        <p className="text-sm text-muted">
          {c.trade}
          {c.phone && (
            <>
              {" · "}
              <a href={`tel:${c.phone}`} className="underline">
                {c.phone}
              </a>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-3">
          <p className="label">Work orders</p>
          {!wos.length && <Empty>No work orders yet.</Empty>}
          {wos.map((w) => {
            const ok = w.bills.filter((b) => b.status === "APPROVED" || b.status === "PAID");
            const billed = ok.reduce((a, b) => a + b.amount, 0);
            const paid = w.bills.filter((b) => b.status === "PAID").reduce((a, b) => a + b.amount, 0);
            return (
              <Link key={w.id} href={`/desk/contractors/wo/${w.number}`} className="card block p-3 text-sm hover:border-brass">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {w.number} · {w.title}
                  </p>
                  <StatusBadge status={w.status} />
                </div>
                <p className="text-xs text-muted">
                  {w.project.name}
                  {w.stage ? ` · ${w.stage.name}` : ""} · {date(w.createdAt)}
                </p>
                <p className="mt-1 text-xs">
                  Agreed {money(w.amount, w.currency)} · billed {money(billed, w.currency)} · paid {money(paid, w.currency)}
                </p>
              </Link>
            );
          })}
        </div>

        <div className="grid content-start gap-5">
          <section className="card p-4">
            <p className="label">New work order</p>
            {active.length ? (
              <WorkOrderForm
                contractorId={c.id}
                projects={active.map((p) => ({ id: p.id, name: p.name, currency: p.office.currency, stages: projectStages.filter((s) => s.projectId === p.id) }))}
              />
            ) : (
              <Empty>No active projects.</Empty>
            )}
          </section>
          <section className="card p-4">
            <p className="label">Details</p>
            <ActionForm action={saveContractor} submitLabel="Save" reset={false} buttonClass="btn-ghost">
              <input type="hidden" name="id" value={c.id} />
              <ContractorFields c={c} offices={offices} />
            </ActionForm>
          </section>
        </div>
      </div>
    </div>
  );
}
