import { and, asc, eq, inArray } from "drizzle-orm";
import { db, projectStatusEnum, stageStatusEnum, users } from "@/db";
import { can } from "@/lib/permissions";
import { date, dateInput, dateTime, titleCase } from "@/lib/format";
import { Badge, Empty, ProgressBar, Section, StatusBadge } from "@/components/ui";
import { loadProject } from "../data";
import { addVisit, deleteVisit, updateProject, updateStage } from "../actions";
import { disablePortal, enablePortal } from "../design-actions";
import { CopyButton } from "@/components/copy-button";
import { appBaseUrl, portalPath } from "@/lib/portal";

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await loadProject(id);
  const editStages = can(user.role, "stages");
  const editProject = can(user.role, "projects.edit");
  const editVisits = can(user.role, "visits");
  const managers = editProject
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.active, true), inArray(users.role, ["OWNER", "ADMIN", "DESIGNER"])))
        .orderBy(asc(users.name))
    : [];
  const upcoming = project.visits.filter((v) => v.at >= new Date(Date.now() - 86400000));
  const portalUrl = project.client.portalToken ? `${await appBaseUrl()}${portalPath(project.client.portalToken)}` : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="grid content-start gap-5">
        <Section title="Stages">
          <ol className="grid gap-2">
            {project.stages.map((s) => (
              <li key={s.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${s.status === "DONE" ? "bg-olive text-white" : s.status === "IN_PROGRESS" ? "bg-brass text-white" : "bg-ivory text-muted"}`}>{s.order}</span>
                    <span className="font-semibold">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {s.plannedEnd && <span>Target {date(s.plannedEnd)}</span>}
                    <StatusBadge status={s.status} />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressBar value={s.progress} />
                  <span className="w-10 text-right text-sm font-semibold">{s.progress}%</span>
                </div>
                {editStages && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-brass">Update stage</summary>
                    <form action={updateStage} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="stageId" value={s.id} />
                      <select name="status" defaultValue={s.status} className="input">
                        {stageStatusEnum.enumValues.map((v) => (
                          <option key={v} value={v}>
                            {titleCase(v)}
                          </option>
                        ))}
                      </select>
                      <input name="progress" type="number" min={0} max={100} defaultValue={s.progress} className="input" aria-label="Progress %" />
                      <input name="plannedEnd" type="date" defaultValue={dateInput(s.plannedEnd)} className="input" aria-label="Target date" />
                      <button className="btn-primary">Save</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Site updates">
          {!project.updates.length && <Empty>No updates yet. Use the voice desk on site to add one.</Empty>}
          <ol className="grid gap-4">
            {project.updates.map((u) => (
              <li key={u.id} className="border-l-2 border-brass/40 pl-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-semibold text-ink">{u.author.name}</span>
                  <span>{dateTime(u.createdAt)}</span>
                  {u.stage && <Badge>{u.stage.name}</Badge>}
                  {u.source === "VOICE" && <Badge tone="brass">Voice</Badge>}
                  {u.sentToClient ? <Badge tone="olive">Sent to client</Badge> : u.clientMessage ? <Badge tone="clay">Client message {u.sendStatus?.startsWith("failed") ? "failed" : "queued"}</Badge> : <Badge>Internal</Badge>}
                </div>
                <p className="mt-1 text-sm">{u.summary}</p>
                {u.changes && u.changes.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs text-muted">
                    {u.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                )}
                {u.issues && <p className="mt-1 rounded-lg bg-clay-soft px-2 py-1 text-xs text-clay">Issue: {u.issues}</p>}
                {u.photos.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {u.photos.map((ph) => (
                      <a key={ph.id} href={ph.url} target="_blank" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ph.url} alt={ph.caption ?? "Site photo"} className="h-24 w-24 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                {u.clientMessage && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted">Client message {u.sendStatus ? `(${u.sendStatus})` : ""}</summary>
                    <p className="mt-1 whitespace-pre-line rounded-lg bg-olive-soft p-2 text-xs">{u.clientMessage}</p>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <div className="grid content-start gap-5">
        <Section title="Client">
          <p className="font-semibold">{project.client.name}</p>
          <a href={`https://wa.me/${project.client.phone.replace(/\D/g, "")}`} target="_blank" className="text-sm font-semibold text-olive hover:underline">
            WhatsApp {project.client.phone}
          </a>
          {project.client.email && <p className="text-sm text-muted">{project.client.email}</p>}
          {project.siteAddress && <p className="mt-2 text-sm text-muted">{project.siteAddress}</p>}
          <p className="mt-2 text-xs text-muted">Project manager: {project.manager?.name ?? "—"}</p>
          <div className="mt-4 border-t border-line pt-3">
            <p className="label">Client portal</p>
            {project.client.portalToken ? (
              <>
                <p className="break-all text-xs text-muted">{portalUrl}</p>
                <p className="mt-1 text-xs text-muted">Last opened: {project.client.portalLastSeenAt ? dateTime(project.client.portalLastSeenAt) : "not yet"}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton text={portalUrl!} />
                  <a
                    href={`https://wa.me/${project.client.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${project.client.name.split(" ")[0]}, you can follow your project's progress, approve designs and see invoices here: ${portalUrl}`)}`}
                    target="_blank"
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    Send on WhatsApp
                  </a>
                  {editProject && (
                    <>
                      <form action={enablePortal}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <button className="btn-ghost px-3 py-1.5 text-xs" title="Old link stops working">New link</button>
                      </form>
                      <form action={disablePortal}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <button className="btn-ghost px-3 py-1.5 text-xs text-clay">Turn off</button>
                      </form>
                    </>
                  )}
                </div>
              </>
            ) : editProject ? (
              <form action={enablePortal}>
                <input type="hidden" name="projectId" value={project.id} />
                <p className="mb-2 text-xs text-muted">Gives the client a private link to see progress, approve designs and download invoices.</p>
                <button className="btn-brass px-3 py-1.5 text-xs">Turn on client portal</button>
              </form>
            ) : (
              <p className="text-xs text-muted">Not turned on.</p>
            )}
          </div>
        </Section>

        <Section title="Site visits & meetings">
          <ul className="grid gap-2">
            {upcoming.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-2 text-sm">
                <div>
                  <p className="font-semibold">{v.title}</p>
                  <p className="text-xs text-muted">{dateTime(v.at)}</p>
                </div>
                {editVisits && (
                  <form action={deleteVisit}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="id" value={v.id} />
                    <button className="text-xs text-muted hover:text-clay">Remove</button>
                  </form>
                )}
              </li>
            ))}
            {!upcoming.length && <p className="text-sm text-muted">Nothing scheduled.</p>}
          </ul>
          {editVisits && (
            <form action={addVisit} className="mt-3 grid gap-2 border-t border-line pt-3">
              <input type="hidden" name="projectId" value={project.id} />
              <input name="title" placeholder="e.g. Client walkthrough" className="input" required />
              <input name="at" type="datetime-local" className="input" required />
              <button className="btn-ghost">Add visit</button>
            </form>
          )}
        </Section>

        {editProject && (
          <Section title="Project details">
            <form action={updateProject} className="grid gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <label className="label">Name</label>
              <input name="name" defaultValue={project.name} className="input" />
              <label className="label">Site address</label>
              <input name="siteAddress" defaultValue={project.siteAddress ?? ""} className="input" />
              <label className="label">Status</label>
              <select name="status" defaultValue={project.status} className="input">
                {projectStatusEnum.enumValues.map((v) => (
                  <option key={v} value={v}>
                    {titleCase(v)}
                  </option>
                ))}
              </select>
              <label className="label">Project manager</label>
              <select name="managerId" defaultValue={project.managerId ?? ""} className="input">
                <option value="">—</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Start</label>
                  <input name="startDate" type="date" defaultValue={dateInput(project.startDate)} className="input" />
                </div>
                <div>
                  <label className="label">Handover</label>
                  <input name="expectedHandover" type="date" defaultValue={dateInput(project.expectedHandover)} className="input" />
                </div>
              </div>
              <button className="btn-primary mt-1">Save details</button>
            </form>
          </Section>
        )}
      </div>
    </div>
  );
}
