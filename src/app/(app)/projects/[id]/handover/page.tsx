import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, snags, warranties } from "@/db";
import { can } from "@/lib/permissions";
import { date, dateInput } from "@/lib/format";
import { DEFAULT_CARE_NOTES, warrantyEnds } from "@/lib/handover";
import { ActionForm } from "@/components/action-form";
import { Empty, Section, StatusBadge } from "@/components/ui";
import { loadProject } from "../../data";
import { addWarranty, deleteWarranty, markHandedOver, saveCareNotes } from "../../handover-actions";

export default async function HandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await loadProject(id);
  if (!can(user.role, "snags")) notFound();
  const [list, ws] = await Promise.all([
    db.query.snags.findMany({ where: eq(snags.projectId, project.id), orderBy: asc(snags.createdAt) }),
    db.query.warranties.findMany({ where: eq(warranties.projectId, project.id), orderBy: asc(warranties.item) }),
  ]);
  const n = (s: string) => list.filter((x) => x.status === s).length;
  const openCount = n("OPEN") + n("FIXED");
  const handedOver = project.status === "HANDED_OVER";
  const canHandover = can(user.role, "projects.edit");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="grid content-start gap-5">
        <Section
          title="Snag list"
          actions={
            <Link href={`/desk/snags?project=${project.id}`} className="btn-ghost px-3 py-1.5 text-xs">
              Open snag list
            </Link>
          }
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Open", n("OPEN"), "text-clay"],
              ["Fixed, to check", n("FIXED"), "text-brass"],
              ["Verified", n("VERIFIED"), "text-olive"],
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-xl bg-ivory p-3">
                <p className={`h-display text-3xl ${c}`}>{v}</p>
                <p className="text-xs text-muted">{l}</p>
              </div>
            ))}
          </div>
          {list.filter((s) => s.status !== "VERIFIED").length > 0 && (
            <ul className="mt-3 divide-y divide-line text-sm">
              {list
                .filter((s) => s.status !== "VERIFIED")
                .slice(0, 8)
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="text-muted">{s.room}:</span> {s.description}
                      {s.fromClient && <span className="ml-1 text-xs text-sky">(client)</span>}
                    </span>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
            </ul>
          )}
        </Section>

        <Section title={`Warranties (${ws.length})`}>
          {!ws.length && <Empty>Add appliance, hardware, waterproofing and workmanship warranties — the client sees them in their handover pack.</Empty>}
          <ul className="divide-y divide-line">
            {ws.map((w) => {
              const ends = warrantyEnds(w.startsOn, w.months);
              return (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="font-semibold">
                      {w.item}
                      {w.brand ? ` — ${w.brand}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {w.months} months{ends ? ` · until ${date(ends)}` : " · starts at handover"}
                      {w.notes ? ` · ${w.notes}` : ""}
                      {w.docUrl && (
                        <>
                          {" · "}
                          <a href={w.docUrl} target="_blank" rel="noreferrer" className="underline">
                            card / invoice
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <form action={deleteWarranty}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="id" value={w.id} />
                    <button className="text-xs text-muted hover:text-clay">Remove</button>
                  </form>
                </li>
              );
            })}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-brass">+ Add warranty</summary>
            <ActionForm action={addWarranty} submitLabel="Add warranty" className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="projectId" value={project.id} />
              <div>
                <label className="label">Item</label>
                <input name="item" required className="input" placeholder="Hob & chimney" />
              </div>
              <div>
                <label className="label">Brand / supplier</label>
                <input name="brand" className="input" placeholder="Faber" />
              </div>
              <div>
                <label className="label">Months</label>
                <input name="months" type="number" min={1} defaultValue={12} className="input" />
              </div>
              <div>
                <label className="label">Starts on</label>
                <input name="startsOn" type="date" defaultValue={dateInput(project.handedOverAt)} className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Warranty card or invoice (optional)</label>
                <input name="doc" type="file" accept="image/*,application/pdf" className="text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <input name="notes" className="input" placeholder="Register on the brand's site with invoice no. …" />
              </div>
            </ActionForm>
          </details>
        </Section>

        <Section title="Care instructions">
          <form action={saveCareNotes} className="grid gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <textarea name="careNotes" rows={8} defaultValue={project.careNotes ?? DEFAULT_CARE_NOTES} className="input text-sm" />
            <div>
              <button className="btn-ghost">Save</button>
            </div>
          </form>
        </Section>
      </div>

      <div className="grid content-start gap-5">
        <Section title="Handover">
          {handedOver ? (
            <div className="grid gap-2 text-sm">
              <p>
                Handed over on <b>{date(project.handedOverAt)}</b>.
              </p>
              {project.amcDueAt && (
                <p>
                  Next maintenance visit (AMC) reminder: <b>{date(project.amcDueAt)}</b>. The client gets a WhatsApp on that day.
                </p>
              )}
              {openCount > 0 && <p className="text-clay">{openCount} snag(s) still open after handover.</p>}
            </div>
          ) : canHandover ? (
            <ActionForm action={markHandedOver} submitLabel="Mark handed over" buttonClass="btn-brass w-full" reset={false}>
              <input type="hidden" name="projectId" value={project.id} />
              <div>
                <label className="label">Handover date</label>
                <input name="handedOverOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input" />
              </div>
              <div>
                <label className="label">Maintenance visit reminder after</label>
                <select name="amcMonths" defaultValue="12" className="input">
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                  <option value="0">No reminder</option>
                </select>
              </div>
              {openCount > 0 && (
                <label className="flex items-start gap-2 rounded-xl bg-clay-soft p-3 text-sm text-clay">
                  <input type="checkbox" name="override" className="mt-0.5 h-4 w-4" />
                  {openCount} snag(s) not verified — hand over anyway
                </label>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="notify" defaultChecked className="mt-0.5 h-4 w-4" />
                Send {project.client.name.split(" ")[0]} the handover pack on WhatsApp
              </label>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">The owner or an admin marks the project handed over.</p>
          )}
        </Section>
        <p className="text-xs text-muted">The client sees warranties, care instructions and their snag list in the portal, and can report new snags there.</p>
      </div>
    </div>
  );
}
