import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, snags } from "@/db";
import { requireUser } from "@/lib/auth";
import { date } from "@/lib/format";
import { scopedContractors, scopedProjects } from "@/lib/site-ops";
import { ActionForm } from "@/components/action-form";
import { Badge, Empty, StatusBadge } from "@/components/ui";
import { addSnag, deleteSnag, reopenSnag, verifySnag } from "./actions";
import { FixForm } from "./fix-form";

const ROOMS = ["Living", "Dining", "Kitchen", "Master bedroom", "Kids bedroom", "Guest bedroom", "Bathrooms", "Balcony", "Entrance", "Whole house"];

export default async function SnagsPage({ searchParams }: { searchParams: Promise<{ project?: string; f?: string }> }) {
  const user = await requireUser("snags");
  const { project: pid, f } = await searchParams;
  const projects = await scopedProjects(user, true);
  const counts = projects.length ? await db.select({ projectId: snags.projectId, status: snags.status }).from(snags) : [];
  const openBy = (id: string) => counts.filter((c) => c.projectId === id && c.status !== "VERIFIED").length;
  const sorted = [...projects].sort((a, b) => openBy(b.id) - openBy(a.id) || Number(a.status === "HANDED_OVER") - Number(b.status === "HANDED_OVER"));
  const project = projects.find((p) => p.id === pid) ?? sorted.find((p) => p.status === "ACTIVE") ?? sorted[0];
  if (!project) return <Empty>No projects yet.</Empty>;

  const [list, contractors] = await Promise.all([
    db.query.snags.findMany({ where: eq(snags.projectId, project.id), with: { contractor: true, createdBy: true }, orderBy: [asc(snags.room), asc(snags.createdAt)] }),
    scopedContractors(user),
  ]);
  const filter = f ?? "open";
  const rows = list.filter((s) => (filter === "open" ? s.status !== "VERIFIED" : filter === "done" ? s.status === "VERIFIED" : true));
  const rooms = [...new Set(rows.map((s) => s.room))];
  const n = (st: string) => list.filter((s) => s.status === st).length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl">Snag list</h1>
          <p className="text-sm text-muted">Everything to fix before (and after) handover — with before and after photos.</p>
        </div>
        <form className="flex gap-1">
          <select name="project" defaultValue={project.id} className="input py-1.5" aria-label="Project">
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {openBy(p.id) ? ` (${openBy(p.id)} open)` : ""}
              </option>
            ))}
          </select>
          <button className="btn-ghost px-3 py-1.5 text-xs">Open</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ["open", `Open & fixed (${n("OPEN") + n("FIXED")})`],
          ["done", `Verified (${n("VERIFIED")})`],
          ["all", `All (${list.length})`],
        ].map(([key, label]) => (
          <Link key={key} href={`/desk/snags?project=${project.id}&f=${key}`} className={`rounded-full border px-3 py-1.5 font-semibold ${filter === key ? "border-ink bg-ink text-paper" : "border-line text-muted"}`}>
            {label}
          </Link>
        ))}
        <span className="ml-auto self-center text-xs text-muted">
          {n("OPEN")} open · {n("FIXED")} waiting for check · {n("VERIFIED")} verified
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-4">
          {!rows.length && <Empty>{filter === "open" ? "No open snags 🎉" : "Nothing here."}</Empty>}
          {rooms.map((room) => (
            <section key={room} className="card p-4">
              <p className="label">{room}</p>
              <ul className="divide-y divide-line">
                {rows
                  .filter((s) => s.room === room)
                  .map((s) => (
                    <li key={s.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[auto_1fr]">
                      <div className="flex gap-1">
                        {s.photoUrl && (
                          <a href={s.photoUrl} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.photoUrl} alt="Before" className="h-16 w-16 rounded-lg object-cover" />
                          </a>
                        )}
                        {s.fixedPhotoUrl && (
                          <a href={s.fixedPhotoUrl} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.fixedPhotoUrl} alt="After" className="h-16 w-16 rounded-lg object-cover ring-2 ring-olive" />
                          </a>
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{s.description}</p>
                          <StatusBadge status={s.status} />
                          {s.fromClient && <Badge tone="sky">From client</Badge>}
                        </div>
                        <p className="text-xs text-muted">
                          {date(s.createdAt)}
                          {s.createdBy ? ` · ${s.createdBy.name}` : ""}
                          {s.contractor ? ` · assigned to ${s.contractor.name}` : ""}
                          {s.fixedAt ? ` · fixed ${date(s.fixedAt)}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {s.status === "OPEN" && <FixForm id={s.id} />}
                          <form action={verifySnag} className="flex gap-2">
                            <input type="hidden" name="id" value={s.id} />
                            {s.status === "FIXED" && user.role !== "SUPERVISOR" && (
                              <button className="btn-brass px-3 py-1.5 text-xs">
                                Verify
                              </button>
                            )}
                            {s.status !== "OPEN" && (
                              <button formAction={reopenSnag} className="btn-ghost px-3 py-1.5 text-xs">
                                Reopen
                              </button>
                            )}
                            {s.status === "OPEN" && (s.createdById === user.id || user.role === "OWNER" || user.role === "ADMIN") && (
                              <button formAction={deleteSnag} className="px-2 text-xs text-muted underline">
                                Delete
                              </button>
                            )}
                          </form>
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="card content-start p-4">
          <p className="label">Add a snag</p>
          <ActionForm action={addSnag} submitLabel="Add snag">
            <input type="hidden" name="projectId" value={project.id} />
            <div>
              <label className="label">Room</label>
              <input name="room" list="snag-rooms" className="input" placeholder="Kitchen" />
              <datalist id="snag-rooms">
                {[...new Set([...ROOMS, ...list.map((s) => s.room)])].map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label">What needs fixing</label>
              <textarea name="description" rows={2} required className="input" placeholder="Wardrobe shutter not aligned, paint touch-up near switchboard…" />
            </div>
            <div>
              <label className="label">Assign to (optional)</label>
              <select name="contractorId" className="input">
                <option value="">—</option>
                {contractors
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.trade})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label">Photo</label>
              <input name="photo" type="file" accept="image/*" capture="environment" className="text-sm" />
            </div>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
