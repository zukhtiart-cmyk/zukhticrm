import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listConversations } from "@/lib/wa-inbox";
import { getSettings } from "@/lib/settings";
import { whatsappConfigured } from "@/lib/whatsapp";
import { dateTime } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "WhatsApp" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser("inbox");
  const { f } = await searchParams;
  const [all, settings] = await Promise.all([listConversations(user), getSettings()]);
  const attention = all.filter((c) => c.needsHuman || c.pending > 0);
  const rows = f === "all" ? all : attention.length ? attention : all;
  const showingAll = f === "all" || !attention.length;

  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {whatsappConfigured() ? <Badge tone="olive">Connected</Badge> : <Badge tone="clay">Not connected</Badge>}
            <span>Assistant: {settings.whatsappMode === "auto" ? "replies automatically" : "drafts replies for approval"}</span>
          </span>
        }
        actions={
          <>
            <Link href="/inbox" className={showingAll ? "btn-ghost" : "btn-primary"}>
              Needs attention ({attention.length})
            </Link>
            <Link href="/inbox?f=all" className={showingAll ? "btn-primary" : "btn-ghost"}>
              All ({all.length})
            </Link>
          </>
        }
      />
      {!rows.length && <Empty>No WhatsApp conversations yet. They appear here when clients message your business number.</Empty>}
      <ul className="card divide-y divide-line">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/inbox/${c.id}`} className="flex items-start justify-between gap-3 p-4 hover:bg-ivory">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{c.client?.name ?? c.lead?.name ?? c.name ?? `+${c.phone}`}</p>
                  {c.client ? <Badge tone="olive">Client</Badge> : c.lead ? <Badge tone="sky">Lead</Badge> : <Badge>Unknown</Badge>}
                  {c.needsHuman && <Badge tone="clay">Needs a person</Badge>}
                  {c.pending > 0 && <Badge tone="brass">{c.pending} to approve</Badge>}
                  {c.aiPaused && <Badge>Assistant paused</Badge>}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">
                  {c.last ? `${c.last.direction === "IN" ? "" : "You: "}${c.last.body || "[photo]"}` : "—"}
                </p>
                {c.activeProject && <p className="text-xs text-muted">{c.activeProject.name}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted">{dateTime(c.lastMessageAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
