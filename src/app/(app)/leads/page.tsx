import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, leads, type LeadStatus } from "@/db";
import { officeScope, requireUser } from "@/lib/auth";
import { date, titleCase } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";
import { LeadBoard } from "./board";

export const metadata = { title: "Leads" };

const COLUMNS: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "SITE_VISIT",
  "DESIGN",
  "QUOTED",
  "WON",
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ lost?: string }>;
}) {
  const user = await requireUser("leads");
  const { lost } = await searchParams;
  const scope = officeScope(user);
  const rows = await db.query.leads.findMany({
    where: and(
      scope ? eq(leads.officeId, scope) : undefined,
      lost ? eq(leads.status, "LOST") : ne(leads.status, "LOST"),
    ),
    with: { office: true, owner: true },
    orderBy: asc(leads.nextFollowUpAt),
  });
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return (
    <>
      <PageHeader
        title={lost ? "Lost leads" : "Leads"}
        subtitle={
          lost
            ? `${rows.length} lost leads`
            : `${rows.length} open and won leads — drag a card to move it to another stage`
        }
        actions={
          <>
            <Link
              href={lost ? "/leads" : "/leads?lost=1"}
              className="btn-ghost"
            >
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
        <LeadBoard
          columns={COLUMNS}
          labels={Object.fromEntries(COLUMNS.map((c) => [c, titleCase(c)]))}
          leads={rows.map((l) => ({
            id: l.id,
            name: l.name,
            status: l.status,
            source: l.source,
            meta: [l.propertyType, l.budgetBand, l.office.name]
              .filter(Boolean)
              .join(" · "),
            followUp: l.nextFollowUpAt ? date(l.nextFollowUpAt) : null,
            overdue:
              !!l.nextFollowUpAt &&
              l.nextFollowUpAt < today &&
              l.status !== "WON",
          }))}
        />
      )}
    </>
  );
}

function LeadCard({
  lead,
  overdue,
}: {
  lead: {
    id: string;
    name: string;
    budgetBand: string | null;
    source: string;
    propertyType: string | null;
    nextFollowUpAt: Date | null;
    office: { name: string };
    owner: { name: string } | null;
  };
  overdue: boolean;
}) {
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="card block p-3 transition hover:border-brass/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{lead.name}</p>
        <Badge>{lead.source}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {[lead.propertyType, lead.budgetBand, lead.office.name]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {lead.nextFollowUpAt && (
        <p
          className={`mt-2 text-xs font-semibold ${overdue ? "text-clay" : "text-muted"}`}
        >
          Follow up {date(lead.nextFollowUpAt)}
        </p>
      )}
    </Link>
  );
}
