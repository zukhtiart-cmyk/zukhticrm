import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db, milestones, orders, projects, siteUpdates, stages } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, canIntake, defaultSendToClient, deskGuide, officeScope } from "@/lib/permissions";
import Link from "next/link";
import { IntakeDesk } from "./intake-desk";
import { whatsappConfigured } from "@/lib/whatsapp";
import { dateTime } from "@/lib/format";
import { Badge } from "@/components/ui";
import { VoiceDesk, type ProjectSnapshot } from "./voice-desk";

export default async function DeskPage({ searchParams }: { searchParams: Promise<{ project?: string; mode?: string }> }) {
  const user = await requireUser("voice");
  const { project: preselect, mode } = await searchParams;
  const intake = canIntake(user.role);
  const switcher = intake ? (
    <div className="flex gap-1 rounded-full bg-paper p-1 text-xs font-semibold shadow-sm">
      {[
        ["", "Project update"],
        ["lead", "New lead"],
        ["contractor", "New contractor"],
      ].map(([key, label]) => (
        <Link key={key} href={key ? `/desk?mode=${key}` : "/desk"} className={`flex-1 rounded-full px-3 py-2 text-center ${(mode ?? "") === key ? "bg-ink text-paper" : "text-muted"}`}>
          {label}
        </Link>
      ))}
    </div>
  ) : null;
  if (intake && (mode === "lead" || mode === "contractor")) {
    const officeRows = await db.query.offices.findMany();
    return (
      <div className="grid gap-4">
        {switcher}
        <IntakeDesk key={mode} kind={mode} offices={officeRows.map((o) => ({ id: o.id, name: o.name }))} serverSpeech={!!process.env.OPENAI_API_KEY} />
      </div>
    );
  }
  const scope = officeScope(user);
  const showStages = can(user.role, "stages") || can(user.role, "design");
  const rows = await db.query.projects.findMany({
    where: and(scope ? eq(projects.officeId, scope) : undefined, ne(projects.status, "HANDED_OVER")),
    with: {
      client: true,
      office: true,
      stages: { orderBy: asc(stages.order) },
      milestones: { orderBy: asc(milestones.sortOrder) },
      orders: { orderBy: desc(orders.updatedAt) },
    },
    orderBy: desc(projects.createdAt),
  });
  const mine = await db.query.siteUpdates.findMany({
    where: eq(siteUpdates.authorId, user.id),
    with: { project: true },
    orderBy: desc(siteUpdates.createdAt),
    limit: 10,
  });

  // Only what this role needs to see before speaking, to avoid recording against stale information.
  const snapshots: Record<string, ProjectSnapshot> = {};
  for (const p of rows) {
    const current = p.stages.find((s) => s.status !== "DONE");
    snapshots[p.id] = {
      progress: p.progress,
      currentStage: current ? `${current.name} · ${current.progress}%` : "All stages done",
      stages: showStages ? p.stages.map((s) => ({ name: s.name, status: s.status, progress: s.progress })) : [],
      orders: can(user.role, "orders") ? p.orders.map((o) => ({ item: o.item, status: o.status, eta: o.eta?.toISOString() ?? null })) : [],
      milestones: can(user.role, "payments")
        ? p.milestones.map((m) => ({ label: m.label, amount: m.amount, status: m.status, currency: p.office.currency }))
        : [],
    };
  }

  return (
    <div className="grid gap-5">
      {switcher}
      <VoiceDesk
        projects={rows.map((p) => ({ id: p.id, name: p.name, client: p.client.name, code: p.code, lat: p.siteLat, lng: p.siteLng }))}
        preselected={rows.some((p) => p.id === preselect)}
        snapshots={snapshots}
        initialProjectId={rows.some((p) => p.id === preselect) ? preselect! : (rows[0]?.id ?? "")}
        defaultSend={defaultSendToClient[user.role]}
        whatsappReady={whatsappConfigured()}
        guide={deskGuide[user.role]}
        serverSpeech={!!process.env.OPENAI_API_KEY}
        perms={{
          stages: can(user.role, "stages"),
          payments: can(user.role, "payments"),
          orders: can(user.role, "orders"),
          visits: can(user.role, "visits"),
          design: can(user.role, "design"),
        }}
      />

      <section className="card p-4">
        <p className="label">My recent updates</p>
        {!mine.length && <p className="text-sm text-muted">Your saved updates will appear here.</p>}
        <ul className="divide-y divide-line">
          {mine.map((u) => (
            <li key={u.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-semibold text-ink">{u.project.name}</span>
                <span>{dateTime(u.createdAt)}</span>
                {u.sentToClient ? <Badge tone="olive">Sent to client</Badge> : u.clientMessage ? <Badge tone="brass">Client update queued</Badge> : <Badge>Internal</Badge>}
              </div>
              <p className="mt-0.5 text-sm">{u.summary}</p>
              {u.changes && u.changes.length > 0 && <p className="text-xs text-muted">{u.changes.join(" · ")}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
