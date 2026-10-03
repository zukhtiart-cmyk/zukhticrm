import { can } from "@/lib/permissions";
import { dateTime } from "@/lib/format";
import { Badge, Empty, Section } from "@/components/ui";
import { DesignStatusBadge, DesignThumb } from "@/components/design-bits";
import { loadProject } from "../../data";
import { deleteDesign, shareDesign, unshareDesign } from "../../design-actions";
import { DesignUploadForm } from "./upload-form";

export default async function DesignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await loadProject(id);
  const edit = can(user.role, "design");

  // Group: room → title → versions (newest first, already sorted)
  const groups = new Map<string, Map<string, typeof project.designs>>();
  for (const d of project.designs) {
    if (!groups.has(d.room)) groups.set(d.room, new Map());
    const byTitle = groups.get(d.room)!;
    byTitle.set(d.title, [...(byTitle.get(d.title) ?? []), d]);
  }
  const pending = project.designs.filter((d) => d.status === "PENDING").length;
  const changes = project.designs.filter((d) => d.status === "CHANGES_REQUESTED");
  const rooms = [...new Set([...project.designs.map((d) => d.room), ...project.boqItems.map((b) => b.room)])];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone="brass">{pending} waiting for client</Badge>
        {changes.length > 0 && <Badge tone="clay">{changes.length} changes requested</Badge>}
        {!project.client.portalToken && <span className="text-xs text-muted">Turn on the client portal (Overview → Client) so the client can see shared designs.</span>}
      </div>

      {edit && (
        <Section title="Upload a design">
          <DesignUploadForm projectId={project.id} rooms={rooms} />
        </Section>
      )}

      {!project.designs.length && <Empty>No designs yet.</Empty>}
      {[...groups.entries()].map(([room, byTitle]) => (
        <Section key={room} title={room}>
          <div className="grid gap-4 md:grid-cols-2">
            {[...byTitle.entries()].map(([title, versions]) => {
              const latest = versions[0];
              return (
                <div key={title} className="rounded-xl border border-line p-3">
                  <DesignThumb url={latest.fileUrl} type={latest.fileType} title={title} />
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="text-xs text-muted">
                        v{latest.version} · {latest.uploadedBy?.name ?? "—"} · {dateTime(latest.createdAt)}
                      </p>
                    </div>
                    <DesignStatusBadge status={latest.status} />
                  </div>
                  {latest.notes && <p className="mt-1 text-sm text-muted">{latest.notes}</p>}
                  {latest.clientComment && (
                    <p className={`mt-2 rounded-lg px-2 py-1.5 text-sm ${latest.status === "APPROVED" ? "bg-olive-soft text-olive" : "bg-clay-soft text-clay"}`}>
                      Client: &ldquo;{latest.clientComment}&rdquo; <span className="text-xs opacity-70">{dateTime(latest.decidedAt)}</span>
                    </p>
                  )}
                  {edit && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {latest.status === "DRAFT" && (
                        <>
                          <form action={shareDesign}>
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="id" value={latest.id} />
                            <button className="btn-brass px-3 py-1.5 text-xs">Share with client</button>
                          </form>
                          <form action={deleteDesign}>
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="id" value={latest.id} />
                            <button className="btn-ghost px-3 py-1.5 text-xs text-clay">Delete</button>
                          </form>
                        </>
                      )}
                      {latest.status === "PENDING" && (
                        <form action={unshareDesign}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="id" value={latest.id} />
                          <button className="btn-ghost px-3 py-1.5 text-xs">Withdraw from client</button>
                        </form>
                      )}
                      {latest.status === "CHANGES_REQUESTED" && <p className="text-xs text-muted">Upload a new version with the same room and title.</p>}
                    </div>
                  )}
                  {versions.length > 1 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-muted">Earlier versions ({versions.length - 1})</summary>
                      <ul className="mt-1 grid gap-1 text-xs">
                        {versions.slice(1).map((v) => (
                          <li key={v.id} className="flex items-center justify-between gap-2">
                            <a href={v.fileUrl} target="_blank" className="hover:text-brass">
                              v{v.version} · {dateTime(v.createdAt)}
                            </a>
                            <span className="text-muted">{v.clientComment ? `“${v.clientComment}”` : v.status.toLowerCase().replace("_", " ")}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}
