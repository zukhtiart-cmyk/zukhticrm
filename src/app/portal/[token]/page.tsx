import Link from "next/link";
import { date, dateTime, money } from "@/lib/format";
import { loadPortalProject } from "@/lib/portal-data";
import { Badge, Empty, ProgressBar, Section } from "@/components/ui";
import { DesignStatusBadge, DesignThumb } from "@/components/design-bits";
import { DesignDecision } from "./design-card";
import { acceptQuote } from "./actions";
import { portalFileUrl } from "@/lib/storage";
import { DEFAULT_CARE_NOTES, warrantyEnds } from "@/lib/handover";
import { ReportSnagForm } from "./snag-form";

const ORDER_LABEL: Record<string, string> = {
  ORDERED: "Ordered",
  IN_PRODUCTION: "Being made",
  SHIPPED: "On the way",
  CUSTOMS: "Clearing customs",
  DELIVERED: "Delivered",
};

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { token } = await params;
  const { p } = await searchParams;
  const { client, project } = await loadPortalProject(token, p);
  const first = client.name.split(" ")[0];

  if (!project) {
    return (
      <Empty>Hi {first}, your project will appear here once it starts.</Empty>
    );
  }

  const cur = project.office.currency;
  const current = project.stages.find((s) => s.status !== "DONE");
  const waiting = project.designs.filter((d) => d.status === "PENDING");
  // Latest version of each design (room + title)
  const latest = project.designs.filter(
    (d, i, all) =>
      all.findIndex((x) => x.room === d.room && x.title === d.title) === i,
  );
  const paid = project.milestones
    .filter((m) => m.status === "PAID")
    .reduce((a, m) => a + (m.paidAmount ?? m.amount), 0);
  const nextDue = project.milestones.find((m) => m.status !== "PAID");
  const photosFeed = project.updates.flatMap((u) => u.photos).slice(0, 12);
  const tabs = [
    ["progress", "Progress"],
    ["updates", "Updates"],
    ["designs", `Designs${waiting.length ? ` (${waiting.length})` : ""}`],
    ["payments", "Payments"],
    ["documents", "Documents"],
  ];
  const handedOver = project.status === "HANDED_OVER";
  const showHandover =
    handedOver ||
    project.snags.length > 0 ||
    project.warranties.length > 0 ||
    project.progress >= 80;
  const openSnags = project.snags.filter((s) => s.status !== "VERIFIED");
  if (showHandover)
    tabs.push([
      "handover",
      handedOver
        ? "Handover pack"
        : `Snag list${openSnags.length ? ` (${openSnags.length})` : ""}`,
    ]);

  return (
    <div className="grid gap-5">
      {client.projects.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {client.projects.map((x) => (
            <Link
              key={x.id}
              href={`/portal/${token}?p=${x.id}`}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${x.id === project.id ? "border-ink bg-ink text-paper" : "border-line text-muted"}`}
            >
              {x.name}
            </Link>
          ))}
        </div>
      )}

      <div>
        <p className="text-sm text-muted">Hello {first},</p>
        <h1 className="h-display text-3xl sm:text-4xl">{project.name}</h1>
        {project.siteAddress && (
          <p className="text-sm text-muted">{project.siteAddress}</p>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="label">Overall progress</p>
            <p className="h-display text-5xl">{project.progress}%</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted">Now</p>
            <p className="font-semibold">{current?.name ?? "Completed"}</p>
            <p className="mt-1 text-muted">Expected handover</p>
            <p className="font-semibold">{date(project.expectedHandover)}</p>
          </div>
        </div>
        <div className="mt-4">
          <ProgressBar value={project.progress} />
        </div>
        {waiting.length > 0 && (
          <a
            href="#designs"
            className="mt-4 block rounded-xl bg-brass-soft px-4 py-3 text-sm font-semibold text-brass"
          >
            {waiting.length} design{waiting.length > 1 ? "s" : ""} waiting for
            your approval →
          </a>
        )}
      </div>

      <nav className="no-print sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-line bg-ivory/95 px-4 py-2 backdrop-blur">
        {tabs.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-muted hover:bg-paper hover:text-ink"
          >
            {label}
          </a>
        ))}
      </nav>

      <Section title="Stages" className="scroll-mt-16">
        <span id="progress" className="relative -top-20 block" />
        <ol className="grid gap-3">
          {project.stages.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.status === "DONE" ? "bg-olive text-white" : s.status === "IN_PROGRESS" ? "bg-brass text-white" : "bg-ivory text-muted"}`}
              >
                {s.status === "DONE" ? "✓" : s.order}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span
                    className={
                      s.status === "NOT_STARTED"
                        ? "text-muted"
                        : "font-semibold"
                    }
                  >
                    {s.name}
                  </span>
                  <span className="text-xs text-muted">
                    {s.status === "DONE"
                      ? "Done"
                      : s.status === "IN_PROGRESS"
                        ? `${s.progress}%`
                        : s.plannedEnd
                          ? `By ${date(s.plannedEnd)}`
                          : ""}
                  </span>
                </div>
                {s.status === "IN_PROGRESS" && (
                  <div className="mt-1">
                    <ProgressBar value={s.progress} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {project.visits.length > 0 && (
        <Section title="Coming up">
          <ul className="grid gap-2 text-sm">
            {project.visits.map((v) => (
              <li key={v.id} className="flex justify-between gap-2">
                <span className="font-semibold">{v.title}</span>
                <span className="text-muted">{dateTime(v.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Updates from site">
        <span id="updates" className="relative -top-20 block" />
        {photosFeed.length > 0 && (
          <div className="-mx-1 mb-4 flex snap-x gap-2 overflow-x-auto px-1">
            {photosFeed.map((ph) => (
              <a
                key={ph.id}
                href={portalFileUrl(ph.url, token)}
                target="_blank"
                className="shrink-0 snap-start"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={portalFileUrl(ph.url, token)}
                  alt={ph.caption ?? "Site photo"}
                  className="h-32 w-32 rounded-xl object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {!project.updates.length && (
          <Empty>Updates from your site team will appear here.</Empty>
        )}
        <ol className="grid gap-4">
          {project.updates.map((u) => (
            <li key={u.id} className="border-l-2 border-brass/40 pl-3">
              <p className="text-xs text-muted">{dateTime(u.createdAt)}</p>
              <p className="mt-0.5 whitespace-pre-line text-sm">
                {u.clientMessage}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Designs">
        <span id="designs" className="relative -top-20 block" />
        {!latest.length && (
          <Empty>Your designs will appear here for approval.</Empty>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {latest.map((d) => (
            <div key={d.id} className="rounded-xl border border-line p-3">
              <DesignThumb
                url={portalFileUrl(d.fileUrl, token)}
                type={d.fileType}
                title={d.title}
              />
              <div className="mt-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{d.title}</p>
                  <p className="text-xs text-muted">
                    {d.room}
                    {d.version > 1 ? ` · version ${d.version}` : ""}
                  </p>
                </div>
                <DesignStatusBadge status={d.status} />
              </div>
              {d.notes && <p className="mt-1 text-sm text-muted">{d.notes}</p>}
              {d.status === "PENDING" ? (
                <DesignDecision
                  token={token}
                  projectId={project.id}
                  designId={d.id}
                />
              ) : (
                d.clientComment && (
                  <p className="mt-2 text-xs text-muted">
                    Your note: &ldquo;{d.clientComment}&rdquo;
                  </p>
                )
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Payments">
        <span id="payments" className="relative -top-20 block" />
        <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-olive-soft p-3">
            <p className="text-xs text-olive">Paid so far</p>
            <p className="text-lg font-bold text-olive">{money(paid, cur)}</p>
          </div>
          <div className="rounded-xl bg-ivory p-3">
            <p className="text-xs text-muted">Next payment</p>
            <p className="text-lg font-bold">
              {nextDue ? money(nextDue.amount, cur) : "—"}
            </p>
            {nextDue && (
              <p className="text-xs text-muted">
                {nextDue.label}
                {nextDue.dueStage ? ` · at ${nextDue.dueStage.name}` : ""}
              </p>
            )}
          </div>
        </div>
        <ul className="divide-y divide-line text-sm">
          {project.milestones.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 py-2.5"
            >
              <div>
                <p className="font-semibold">{m.label}</p>
                <p className="text-xs text-muted">
                  {m.percent}%
                  {m.status === "PAID"
                    ? ` · paid ${date(m.paidAt)}`
                    : m.dueStage
                      ? ` · due at ${m.dueStage.name}`
                      : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {money(
                    m.status === "PAID" ? (m.paidAmount ?? m.amount) : m.amount,
                    cur,
                  )}
                </span>
                {m.status === "PAID" ? (
                  <Badge tone="olive">Paid</Badge>
                ) : m.invoiceNumber ? (
                  <Badge tone="brass">Due</Badge>
                ) : (
                  <Badge>Upcoming</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Documents">
        <span id="documents" className="relative -top-20 block" />
        <ul className="divide-y divide-line text-sm">
          {project.quotes.map((q) => (
            <li
              key={q.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <Link
                href={`/portal/${token}/quote/${q.id}`}
                className="font-semibold hover:text-brass"
              >
                Quotation v{q.version} · {money(q.total, q.currency)}
              </Link>
              {q.status === "ACCEPTED" ? (
                <Badge tone="olive">Accepted</Badge>
              ) : (
                !project.quotes.some((x) => x.status === "ACCEPTED") && (
                  <form action={acceptQuote}>
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="quoteId" value={q.id} />
                    <button className="btn-brass px-3 py-1.5 text-xs">
                      Accept quote
                    </button>
                  </form>
                )
              )}
            </li>
          ))}
          {project.milestones
            .filter((m) => m.invoiceNumber)
            .map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <Link
                  href={`/portal/${token}/invoice/${m.id}`}
                  className="font-semibold hover:text-brass"
                >
                  Invoice {m.invoiceNumber} · {m.label}
                </Link>
                <span className="text-xs text-muted">{date(m.invoicedAt)}</span>
              </li>
            ))}
          {!project.quotes.length &&
            !project.milestones.some((m) => m.invoiceNumber) && (
              <Empty>Quotes and invoices will appear here.</Empty>
            )}
        </ul>
      </Section>

      {showHandover && (
        <Section
          title={handedOver ? "Your handover pack" : "Finishing touches"}
        >
          <span id="handover" className="relative -top-20 block" />
          {handedOver && (
            <p className="mb-3 text-sm">
              Handed over on <b>{date(project.handedOverAt)}</b>
              {project.amcDueAt ? (
                <>
                  {" "}
                  · we&apos;ll remind you for a maintenance check around{" "}
                  <b>{date(project.amcDueAt)}</b>
                </>
              ) : null}
              .
            </p>
          )}
          <p className="label">Snag list</p>
          {!project.snags.length && (
            <p className="mb-3 text-sm text-muted">
              Nothing on the list. If you spot anything, tell us below.
            </p>
          )}
          <ul className="mb-3 divide-y divide-line text-sm">
            {project.snags.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="flex items-center gap-2">
                  {(s.fixedPhotoUrl ?? s.photoUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={portalFileUrl(
                        (s.fixedPhotoUrl ?? s.photoUrl)!,
                        token,
                      )}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  )}
                  <span>
                    <span className="text-muted">{s.room}:</span>{" "}
                    {s.description}
                  </span>
                </span>
                <Badge
                  tone={
                    s.status === "VERIFIED"
                      ? "olive"
                      : s.status === "FIXED"
                        ? "sky"
                        : "brass"
                  }
                >
                  {s.status === "VERIFIED"
                    ? "Done"
                    : s.status === "FIXED"
                      ? "Fixed"
                      : "To do"}
                </Badge>
              </li>
            ))}
          </ul>
          <details className="mb-4" open={handedOver}>
            <summary className="cursor-pointer text-sm font-semibold text-brass">
              Report something that needs fixing
            </summary>
            <div className="mt-2">
              <ReportSnagForm token={token} projectId={project.id} />
            </div>
          </details>

          {project.warranties.length > 0 && (
            <>
              <p className="label">Warranties</p>
              <ul className="mb-4 divide-y divide-line text-sm">
                {project.warranties.map((w) => {
                  const ends = warrantyEnds(
                    w.startsOn ?? project.handedOverAt,
                    w.months,
                  );
                  return (
                    <li
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span>
                        <span className="font-semibold">{w.item}</span>
                        {w.brand ? ` — ${w.brand}` : ""}
                        {w.notes && (
                          <span className="block text-xs text-muted">
                            {w.notes}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted">
                        {ends
                          ? `Valid until ${date(ends)}`
                          : `${w.months} months from handover`}
                        {w.docUrl && (
                          <>
                            {" · "}
                            <a
                              href={portalFileUrl(w.docUrl, token)}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              card
                            </a>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {handedOver && (
            <>
              <p className="label">Caring for your interiors</p>
              <ul className="ml-4 list-disc text-sm">
                {(project.careNotes ?? DEFAULT_CARE_NOTES)
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((l) => (
                    <li key={l}>{l}</li>
                  ))}
              </ul>
            </>
          )}
        </Section>
      )}

      {project.orders.length > 0 && (
        <Section title="Furniture & fittings">
          <ul className="divide-y divide-line text-sm">
            {project.orders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <span className="font-semibold">{o.item}</span>
                <span className="text-xs text-muted">
                  {ORDER_LABEL[o.status]}
                  {o.eta && o.status !== "DELIVERED"
                    ? ` · around ${date(o.eta)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your project team">
        <p className="text-sm">
          {project.manager ? (
            <span className="font-semibold">{project.manager.name}</span>
          ) : (
            "Zukhti Home"
          )}{" "}
          · {project.office.name}
        </p>
        {project.manager?.phone && (
          <a
            href={`https://wa.me/${project.manager.phone.replace(/\D/g, "")}`}
            target="_blank"
            className="mt-2 inline-block btn-ghost px-3 py-1.5 text-xs"
          >
            WhatsApp your project manager
          </a>
        )}
      </Section>
    </div>
  );
}
