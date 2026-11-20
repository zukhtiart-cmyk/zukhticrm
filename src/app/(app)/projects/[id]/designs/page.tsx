import { can } from "@/lib/permissions";
import { dateTime } from "@/lib/format";
import { Badge, Empty, Section } from "@/components/ui";
import { DesignStatusBadge, DesignThumb } from "@/components/design-bits";
import { loadProject } from "../../data";
import { buildWalkthrough, deleteDesign, resetWalkthrough, shareDesign, unshareDesign } from "../../design-actions";
import { render3dReady, worldViewerUrl } from "@/lib/render3d";
import { DesignUploadForm } from "./upload-form";
import { FloorPlanRenderForm } from "./render-form";
import { WalkthroughWatcher } from "./walkthrough";

// A floor-plan render waits on MeltFlex for ~20 s.
export const maxDuration = 60;

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
        <Section title="Floor plan → 3D render">
          {render3dReady() ? (
            <FloorPlanRenderForm projectId={project.id} rooms={rooms} />
          ) : (
            <p className="text-sm text-muted">
              Turn this on by adding <code>MELTFLEX_API_KEY</code> in Vercel (from meltflexai.com/settings), then redeploy. Upload a floor plan here and get a furnished 3D picture in about 20 seconds.
            </p>
          )}
        </Section>
      )}

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
                  {latest.render && (
                    <p className="mt-1 text-xs text-muted">
                      Made from a floor plan ·{" "}
                      {latest.render.planUrl && (
                        <a href={latest.render.planUrl} target="_blank" className="underline hover:text-brass">
                          see plan
                        </a>
                      )}
                    </p>
                  )}
                  {latest.worldId && (
                    <a href={worldViewerUrl(latest.worldId)} target="_blank" className="btn-brass mt-2 inline-flex px-3 py-1.5 text-xs">
                      Walk through in 3D ↗
                    </a>
                  )}
                  {edit && !latest.worldId && latest.worldStatus === "building" && (
                    <div className="mt-2">
                      <WalkthroughWatcher designId={latest.id} />
                    </div>
                  )}
                  {edit && latest.worldStatus?.startsWith("failed") && (
                    <form action={resetWalkthrough} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-clay">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="id" value={latest.id} />
                      <span>{latest.worldStatus.replace(/^failed: ?/, "Walk-through didn't build: ")}</span>
                      <button className="btn-ghost px-2 py-1 text-xs">Clear</button>
                    </form>
                  )}
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
                      {render3dReady() && latest.fileType === "image" && !latest.worldId && !latest.worldStatus && (
                        <form action={buildWalkthrough}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="id" value={latest.id} />
                          <button className="btn-ghost px-3 py-1.5 text-xs" title="About a minute · 30 MeltFlex credits">
                            Build 3D walk-through · 30 cr
                          </button>
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
