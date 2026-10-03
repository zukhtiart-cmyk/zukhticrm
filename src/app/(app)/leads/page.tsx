import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, leads, type LeadStatus } from "@/db";
import { officeScope, requireUser } from "@/lib/auth";
import { date, titleCase } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";

export const metadata = { title: "Leads" };

const COLUMNS: LeadStatus[] = ["NEW", "CONTACTED", "SITE_VISIT", "DESIGN", "QUOTED", "WON"];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ lost?: string }> }) {
  const user = await requireUser("leads");
  const { lost } = await searchParams;
  const scope = officeScope(user);
  const rows = await db.query.leads.findMany({
    where: and(scope ? eq(leads.officeId, scope) : undefined, lost ? eq(leads.status, "LOST") : ne(leads.status, "LOST")),
    with: { office: true, owner: true },
    orderBy: asc(leads.nextFollowUpAt),
  });
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return (
    <>
      <PageHeader
        title={lost ? "Lost leads" : "Leads"}
        subtitle={`${rows.length} ${lost ? "lost" : "open and won"} leads`}
        actions={
          <>
            <Link href={lost ? "/leads" : "/leads?lost=1"} className="btn-ghost">
              {lost ? "Back to pipeline" : "Lost leads"}
            </Link>
            <Link href="/leads/new" className="btn-primary">
              New lead
            </Link>
          </>
        }
      />
      {lost ? (
        <div className="grid gap-2">
          {rows.map((l) => (
            <LeadCard key={l.id} lead={l} overdue={false} />
          ))}
        </div>
      ) : (
        <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {COLUMNS.map((status) => {
            const items = rows.filter((r) => r.status === status);
            return (
              <div key={status} className="w-72 shrink-0 snap-start">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{titleCase(status)}</h2>
                  <span className="text-xs text-muted">{items.length}</span>
                </div>
                <div className="grid gap-2">
                  {items.map((l) => (
                    <LeadCard key={l.id} lead={l} overdue={!!l.nextFollowUpAt && l.nextFollowUpAt < today && status !== "WON"} />
                  ))}
                  {!items.length && <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">None</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function LeadCard({
  lead,
  overdue,
}: {
  lead: { id: string; name: string; budgetBand: string | null; source: string; propertyType: string | null; nextFollowUpAt: Date | null; office: { name: string }; owner: { name: string } | null };
  overdue: boolean;
}) {
  return (
    <Link href={`/leads/${lead.id}`} className="card block p-3 transition hover:border-brass/40">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{lead.name}</p>
        <Badge>{lead.source}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">{[lead.propertyType, lead.budgetBand, lead.office.name].filter(Boolean).join(" · ")}</p>
      {lead.nextFollowUpAt && <p className={`mt-2 text-xs font-semibold ${overdue ? "text-clay" : "text-muted"}`}>Follow up {date(lead.nextFollowUpAt)}</p>}
    </Link>
  );
}
