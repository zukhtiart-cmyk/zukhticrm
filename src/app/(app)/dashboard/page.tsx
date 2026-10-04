import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { dailyReports, db, offices } from "@/db";
import { generateDailyReport } from "./actions";
import { requireUser } from "@/lib/auth";
import { dashboardData } from "@/lib/dashboard";
import { pendingApprovals } from "@/lib/site-ops";
import { date, dateTime, money, titleCase } from "@/lib/format";
import { Badge, Empty, PageHeader, ProgressBar, Section, Stat } from "@/components/ui";

export const metadata = { title: "Dashboard" };

const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const user = await requireUser("admin");
  const { office } = await searchParams;
  const [d, officeRows, report] = await Promise.all([
    dashboardData(office || undefined),
    db.select().from(offices).orderBy(asc(offices.createdAt)),
    db.query.dailyReports.findFirst({ orderBy: desc(dailyReports.day) }),
  ]);
  const approvals = await pendingApprovals(user);
  const t = d.totals;
  const maxLead = Math.max(1, ...d.pipeline.map((p) => p.count));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`All amounts in INR-equivalent (exchange rates as of ${d.fxAsOf}); each project in its own currency below.`}
        actions={
          <div className="flex flex-wrap gap-1">
            {[{ id: "", name: "All offices" }, ...officeRows].map((o) => (
              <Link key={o.id} href={o.id ? `/dashboard?office=${o.id}` : "/dashboard"} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${(office ?? "") === o.id ? "border-ink bg-ink text-paper" : "border-line text-muted"}`}>
                {o.name}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contract value (live)" value={lakh(t.contractInr)} hint={`${t.activeProjects} active · ${t.inDesign} in design`} />
        <Stat label="Collected this month" value={lakh(t.collectedMonthInr)} />
        <Stat label="Due now" value={lakh(t.dueNowInr)} hint={`${lakh(t.outstandingInr)} outstanding in total`} />
        <Stat label="Average margin" value={`${t.avgMargin}%`} hint="using actual PO costs where ordered" />
        <Stat label="Open leads" value={t.openLeads} hint={`${t.wonLast30} won in 30 days`} />
        <Stat label="Quotes awaiting yes" value={lakh(t.sentQuotesInr)} />
        <Stat label="Orders past ETA" value={t.lateOrders} />
        <Stat label="Approvals waiting" value={<Link href="/desk/expenses">{approvals}</Link>} hint="site expenses + contractor bills" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-5">
          <Section title="Projects">
            {!d.rows.length && <Empty>No live projects.</Empty>}
            <div className="overflow-x-auto">
              {d.rows.length > 0 && (
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Progress</th>
                      <th className="text-right">Contract</th>
                      <th className="text-right">Collected</th>
                      <th className="text-right">Margin</th>
                      <th>Handover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="min-w-48">
                          <Link href={`/projects/${r.id}`} className="font-semibold hover:text-brass">
                            {r.name}
                          </Link>
                          <p className="text-xs text-muted">
                            {r.client} · {r.office}
                          </p>
                          {r.stale && <Badge tone="brass">No recent update</Badge>}
                        </td>
                        <td className="min-w-36">
                          <ProgressBar value={r.progress} />
                          <p className="mt-1 text-xs text-muted">
                            {r.progress}% · {r.currentStage}
                          </p>
                        </td>
                        <td className="whitespace-nowrap text-right">{money(r.contract, r.currency)}</td>
                        <td className="whitespace-nowrap text-right">
                          {money(r.collected, r.currency)}
                          {r.dueNow > 0 && <p className="text-xs text-clay">due {money(r.dueNow, r.currency)}</p>}
                        </td>
                        <td className={`whitespace-nowrap text-right font-semibold ${r.contract && r.marginPct < 20 ? "text-clay" : "text-olive"}`}>
                          {r.contract ? `${r.marginPct}%` : "—"}
                          {r.contract > 0 && r.marginPct !== r.estimatedPct && <p className="text-xs font-normal text-muted">est. {r.estimatedPct}%</p>}
                        </td>
                        <td className={`whitespace-nowrap ${r.handoverLate ? "font-semibold text-clay" : ""}`}>{date(r.handover)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Section>

          {!office && d.offices.length > 1 && (
            <Section title="By office">
              <div className="grid gap-3 sm:grid-cols-3">
                {d.offices.map((o) => (
                  <div key={o.id} className="rounded-xl border border-line p-3">
                    <p className="font-semibold">{o.name}</p>
                    <p className="text-xs text-muted">{o.projects} live projects</p>
                    <p className="mt-1 text-sm">Contract {money(o.contract, o.currency)}</p>
                    <p className="text-sm text-olive">Collected {money(o.collected, o.currency)}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div className="grid content-start gap-5">
          <Section title="Needs attention">
            {!d.attention.length && <Empty>All projects on track.</Empty>}
            <ul className="grid gap-2">
              {d.attention.map((a, i) => (
                <li key={i}>
                  <Link href={`/projects/${a.projectId}`} className={`block rounded-xl px-3 py-2 text-sm ${a.tone === "clay" ? "bg-clay-soft text-clay" : "bg-brass-soft text-brass"}`}>
                    <span className="font-semibold">{a.project}</span> — {a.text}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Lead pipeline">
            <ul className="grid gap-2">
              {d.pipeline.map((p) => (
                <li key={p.status} className="grid grid-cols-[90px_1fr_28px] items-center gap-2 text-xs">
                  <span className="text-muted">{titleCase(p.status)}</span>
                  <span className="h-2.5 rounded-full bg-line/60">
                    <span className="block h-full rounded-full bg-brass" style={{ width: `${(p.count / maxLead) * 100}%` }} />
                  </span>
                  <span className="text-right font-semibold">{p.count}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={report ? `Site summary · ${report.day}` : "Daily site summary"}>
            {report ? <p className="whitespace-pre-line text-sm">{report.body}</p> : <Empty>The evening summary of all site updates appears here each day at 7 pm.</Empty>}
            {report && <p className="mt-2 text-xs text-muted">Generated {dateTime(report.createdAt)}</p>}
            <form action={generateDailyReport} className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost py-1.5 text-xs">Generate now</button>
              <button name="send" value="1" className="btn-ghost py-1.5 text-xs">Generate &amp; send on WhatsApp</button>
            </form>
          </Section>
        </div>
      </div>
    </>
  );
}
