import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadConversation } from "@/lib/wa-inbox";
import { withinWindow } from "@/lib/wa-conversations";
import { templateConfigured } from "@/lib/whatsapp";
import { dateTime } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";
import { approvePending, discardPending, markHandled, setAiPaused } from "../actions";
import { ReplyForm } from "./reply-form";

const STATUS_LABEL: Record<string, string> = {
  AUTO_REPLIED: "Assistant",
  SENT: "Sent",
  QUEUED: "Not sent (queued)",
  FAILED: "Failed",
  DISCARDED: "Discarded",
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("inbox");
  const c = await loadConversation(id, user);
  if (!c) notFound();
  const title = c.client?.name ?? c.lead?.name ?? c.name ?? `+${c.phone}`;

  return (
    <>
      <PageHeader
        title={title}
        back={{ href: "/inbox", label: "WhatsApp" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <a href={`https://wa.me/${c.phone}`} target="_blank" className="font-semibold text-olive hover:underline">
              +{c.phone}
            </a>
            {c.client ? <Badge tone="olive">Client</Badge> : c.lead ? <Link href={`/leads/${c.lead.id}`}><Badge tone="sky">Lead — open</Badge></Link> : <Badge>Unknown number</Badge>}
            {c.activeProject && (
              <Link href={`/projects/${c.activeProject.id}`} className="hover:text-ink">
                {c.activeProject.name}
              </Link>
            )}
            {withinWindow(c) ? <Badge tone="olive">Can reply freely (24h)</Badge> : <Badge>Outside 24h window</Badge>}
          </span>
        }
        actions={
          <>
            {c.client && (
              <form action={setAiPaused}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="paused" value={c.aiPaused ? "0" : "1"} />
                <button className={c.aiPaused ? "btn-brass" : "btn-ghost"}>{c.aiPaused ? "Resume assistant" : "Pause assistant"}</button>
              </form>
            )}
            {c.needsHuman && (
              <form action={markHandled}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn-ghost">Mark handled</button>
              </form>
            )}
          </>
        }
      />

      {c.aiPaused && <p className="mb-4 rounded-xl bg-clay-soft px-4 py-2 text-sm text-clay">The assistant is paused for this client — you&apos;re handling the conversation. Resume it when done.</p>}

      <div className="mx-auto grid max-w-2xl gap-3 pb-6">
        {c.messages.map((m) => {
          const inbound = m.direction === "IN";
          const pending = m.status === "PENDING_APPROVAL";
          if (m.status === "DISCARDED") return null;
          return (
            <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${inbound ? "border border-line bg-paper" : pending ? "border-2 border-dashed border-brass bg-brass-soft/50" : "bg-olive-soft"}`}>
                {m.kind === "image" && m.mediaUrl && (
                  <a href={m.mediaUrl} target="_blank">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.mediaUrl} alt="" className="mb-1 max-h-48 rounded-lg" />
                  </a>
                )}
                {pending ? (
                  <form className="grid gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="messageId" value={m.id} />
                    <p className="text-xs font-semibold text-brass">Assistant draft — check, edit and send{m.kind === "text+photos" ? " (latest photos will be attached)" : ""}</p>
                    <textarea name="text" defaultValue={m.body} rows={Math.min(12, m.body.split("\n").length + 1)} className="input bg-paper" />
                    <div className="flex gap-2">
                      <button formAction={approvePending} className="btn-primary px-3 py-1.5 text-xs">
                        Send
                      </button>
                      <button formAction={discardPending} className="btn-ghost px-3 py-1.5 text-xs">
                        Discard
                      </button>
                    </div>
                  </form>
                ) : (
                  m.body && <p className="whitespace-pre-line">{m.body}</p>
                )}
                <p className="mt-1 text-[11px] text-muted">
                  {dateTime(m.createdAt)}
                  {!inbound && !pending && ` · ${m.author?.name ?? STATUS_LABEL[m.status] ?? m.status}`}
                  {!inbound && (m.status === "FAILED" || m.status === "QUEUED") && ` · ${STATUS_LABEL[m.status]}${m.error ? `: ${m.error}` : ""}`}
                  {inbound && m.intent && ` · ${m.intent}`}
                </p>
              </div>
            </div>
          );
        })}
        {!c.messages.length && <p className="text-center text-sm text-muted">No messages yet.</p>}
      </div>

      <div className="mx-auto max-w-2xl">
        <ReplyForm id={c.id} windowOpen={withinWindow(c)} templateReady={templateConfigured()} />
      </div>
    </>
  );
}
