import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, projects } from "@/db";
import { officeScope, requireUser } from "@/lib/auth";
import { date } from "@/lib/format";
import { PageHeader, ProgressBar, StatusBadge, Empty } from "@/components/ui";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser("projects.view");
  const scope = officeScope(user);
  const rows = await db.query.projects.findMany({
    where: scope ? eq(projects.officeId, scope) : undefined,
    with: { client: true, office: true, stages: true },
    orderBy: desc(projects.createdAt),
  });

  return (
    <>
      <PageHeader title="Projects" subtitle={`${rows.length} projects`} actions={user.role === "OWNER" || user.role === "ADMIN" || user.role === "DESIGNER" ? <Link href="/leads" className="btn-ghost">New project from a lead</Link> : null} />
      {!rows.length && <Empty>No projects yet. Convert a won lead to create one.</Empty>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((p) => {
          const current = [...p.stages].sort((a, b) => a.order - b.order).find((s) => s.status !== "DONE");
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="card block p-4 transition hover:border-brass/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted">{p.code} · {p.office.name}</p>
                  <p className="h-display text-2xl leading-tight">{p.name}</p>
                  <p className="text-sm text-muted">{p.client.name}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <ProgressBar value={p.progress} />
                <span className="text-sm font-semibold">{p.progress}%</span>
              </div>
              <p className="mt-2 text-xs text-muted">
                {current ? `Now: ${current.name}` : "All stages done"} · Handover {date(p.expectedHandover)}
              </p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
