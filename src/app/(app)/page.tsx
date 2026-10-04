import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db, designs, leads, milestones, projects, siteUpdates, visits } from "@/db";
import { officeScope, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { date, dateTime, money } from "@/lib/format";
import { Badge, Empty, PageHeader, ProgressBar, Section, Stat } from "@/components/ui";

export const metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const scope = officeScope(user);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const inAWeek = new Date(Date.now() + 7 * 86400000);

  const projectScope = scope ? eq(projects.officeId, scope) : undefined;
  const scopedProjects = await db.query.projects.findMany({
    where: and(projectScope, inArray(projects.status, ["DESIGN", "ACTIVE", "ON_HOLD"])),
    with: { client: true, stages: true },
    orderBy: asc(projects.expectedHandover),
  });
  const projectIds = scopedProjects.map((p) => p.id);

  const [followUps, pipeline, dueMilestones, upcomingVisits, recentUpdates, clientResponses] = await Promise.all([
    can(user.role, "leads")
      ? db.query.leads.findMany({
          where: and(scope ? eq(leads.officeId, scope) : undefined, lte(leads.nextFollowUpAt, endOfToday), inArray(leads.status, ["NEW", "CONTACTED", "SITE_VISIT", "DESIGN", "QUOTED"])),
          orderBy: asc(leads.nextFollowUpAt),
          limit: 12,
        })
      : Promise.resolve([]),
    can(user.role, "leads")
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(leads)
          .where(and(scope ? eq(leads.officeId, scope) : undefined, inArray(leads.status, ["NEW", "CONTACTED", "SITE_VISIT", "DESIGN", "QUOTED"])))
      : Promise.resolve([{ n: 0 }]),
    can(user.role, "payments") && projectIds.length
      ? db.query.milestones.findMany({
          where: and(inArray(milestones.projectId, projectIds), ne(milestones.status, "PAID")),
          with: { project: { with: { office: true } }, dueStage: true },
          orderBy: asc(milestones.sortOrder),
        })
      : Promise.resolve([]),
    projectIds.length
      ? db.query.visits.findMany({
          where: and(inArray(visits.projectId, projectIds), gte(visits.at, new Date(Date.now() - 3600000)), lte(visits.at, inAWeek)),
          with: { project: true },
          orderBy: asc(visits.at),
        })
      : Promise.resolve([]),
    projectIds.length
      ? db.query.siteUpdates.findMany({
          where: inArray(siteUpdates.projectId, projectIds),
          with: { project: true, author: true },
          orderBy: desc(siteUpdates.createdAt),
          limit: 6,
        })
      : Promise.resolve([]),
    can(user.role, "design") && projectIds.length
      ? db.query.designs.findMany({
          where: and(inArray(designs.projectId, projectIds), inArray(designs.status, ["APPROVED", "CHANGES_REQUESTED"]), gte(designs.decidedAt, new Date(Date.now() - 7 * 86400000))),
          with: { project: true },
          orderBy: desc(designs.decidedAt),
          limit: 8,
        })
      : Promise.resolve([]),
  ]);

  // A milestone is "due" when its stage has started (or it has no stage, like the booking advance).
  const dueNow = dueMilestones.filter((m) => !m.dueStage || m.dueStage.status !== "NOT_STARTED");

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} subtitle={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} actions={<Link href="/desk" className="btn-brass">Voice update</Link>} />
      {denied && <p className="mb-4 rounded-xl bg-clay-soft px-4 py-2 text-sm text-clay">Your role doesn&apos;t have access to that page.</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active projects" value={scopedProjects.length} />
        {can(user.role, "leads") && <Stat label="Open leads" value={pipeline[0]?.n ?? 0} hint={`${followUps.length} to follow up today`} />}
        {can(user.role, "payments") && <Stat label="Payments due" value={dueNow.length} />}
        <Stat label="Visits this week" value={upcomingVisits.length} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {can(user.role, "leads") && (
          <Section title="Follow up today" actions={<Link href="/leads" className="text-xs font-semibold text-brass">All leads</Link>}>
            {!followUps.length && <Empty>No follow-ups due. Nice.</Empty>}
            <ul className="divide-y divide-line">
              {followUps.map((l) => (
                <li key={l.id}>
                  <Link href={`/leads/${l.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-brass">
                    <div>
                      <p className="font-semibold">{l.name}</p>
                      <p className="text-xs text-muted">{[l.propertyType, l.budgetBand].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className={`text-xs font-semibold ${l.nextFollowUpAt && l.nextFollowUpAt < new Date(new Date().setHours(0, 0, 0, 0)) ? "text-clay" : "text-muted"}`}>{date(l.nextFollowUpAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Projects" actions={<Link href="/projects" className="text-xs font-semibold text-brass">All projects</Link>}>
          {!scopedProjects.length && <Empty>No active projects.</Empty>}
          <ul className="grid gap-3">
            {scopedProjects.slice(0, 6).map((p) => {
              const current = [...p.stages].sort((a, b) => a.order - b.order).find((s) => s.status !== "DONE");
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="block hover:text-brass">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{p.name}</p>
                      <span className="text-sm font-semibold">{p.progress}%</span>
                    </div>
                    <ProgressBar value={p.progress} />
                    <p className="mt-1 text-xs text-muted">
                      {current?.name ?? "Complete"} · Handover {date(p.expectedHandover)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>

        {can(user.role, "payments") && (
          <Section title="Payments due">
            {!dueNow.length && <Empty>No milestones due right now.</Empty>}
            <ul className="divide-y divide-line">
              {dueNow.map((m) => (
                <li key={m.id}>
                  <Link href={`/projects/${m.projectId}/payments`} className="flex items-center justify-between gap-2 py-2.5 hover:text-brass">
                    <div>
                      <p className="font-semibold">{m.project.name}</p>
                      <p className="text-xs text-muted">{m.label}</p>
                    </div>
                    <span className="text-sm font-semibold">{money(m.amount, m.project.office.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {clientResponses.length > 0 && (
          <Section title="Client design responses (7 days)">
            <ul className="divide-y divide-line">
              {clientResponses.map((d) => (
                <li key={d.id}>
                  <Link href={`/projects/${d.projectId}/designs`} className="block py-2.5 hover:text-brass">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">
                        {d.project.name} · {d.title}
                      </p>
                      <Badge tone={d.status === "APPROVED" ? "olive" : "clay"}>{d.status === "APPROVED" ? "Approved" : "Changes"}</Badge>
                    </div>
                    {d.clientComment && <p className="text-xs text-muted">&ldquo;{d.clientComment}&rdquo;</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Visits this week">
          {!upcomingVisits.length && <Empty>Nothing scheduled this week.</Empty>}
          <ul className="divide-y divide-line">
            {upcomingVisits.map((v) => (
              <li key={v.id}>
                <Link href={`/projects/${v.projectId}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-brass">
                  <div>
                    <p className="font-semibold">{v.title}</p>
                    <p className="text-xs text-muted">{v.project.name}</p>
                  </div>
                  <span className="text-xs font-semibold text-muted">{dateTime(v.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Latest site updates" className="lg:col-span-2">
          {!recentUpdates.length && <Empty>No updates yet.</Empty>}
          <ul className="divide-y divide-line">
            {recentUpdates.map((u) => (
              <li key={u.id} className="py-2.5">
                <Link href={`/projects/${u.projectId}`} className="block hover:text-brass">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-ink">{u.project.name}</span>
                    <span>{u.author.name}</span>
                    <span>{dateTime(u.createdAt)}</span>
                    {u.sentToClient && <Badge tone="olive">Sent to client</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm">{u.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
