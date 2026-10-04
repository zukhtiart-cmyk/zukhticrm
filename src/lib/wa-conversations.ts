import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { clients, conversations, db, leads, offices, projects, waMessages, type WaStatus } from "@/db";
import { normalizePhone, phoneKey, sendImage, sendTemplate, sendText, templateConfigured, whatsappConfigured } from "./whatsapp";

export type Conversation = typeof conversations.$inferSelect;
const DAY = 24 * 3600 * 1000;

/** Finds the client (or lead) whose saved phone matches, ignoring spaces, + and country code. */
export async function matchPhone(phone: string) {
  const key = phoneKey(phone);
  const digits = sql<string>`right(regexp_replace(${clients.phone}, '\\D', '', 'g'), 10)`;
  const client = await db.query.clients.findFirst({ where: sql`${digits} = ${key}` });
  if (client) return { client, lead: null };
  const leadDigits = sql<string>`right(regexp_replace(${leads.phone}, '\\D', '', 'g'), 10)`;
  const lead = await db.query.leads.findFirst({ where: sql`${leadDigits} = ${key}` });
  return { client: null, lead: lead ?? null };
}

export async function activeProjectsFor(clientId: string) {
  return db.query.projects.findMany({
    where: and(eq(projects.clientId, clientId), ne(projects.status, "HANDED_OVER")),
    orderBy: asc(projects.createdAt),
  });
}

/** Gets or creates the conversation for a phone number and links it to a client or lead. */
export async function getConversation(phone: string, profileName?: string | null) {
  const digits = normalizePhone(phone);
  let conv = await db.query.conversations.findFirst({ where: eq(conversations.phone, digits) });
  if (!conv) {
    const { client, lead } = await matchPhone(digits);
    [conv] = await db
      .insert(conversations)
      .values({ phone: digits, name: client?.name ?? lead?.name ?? profileName ?? null, clientId: client?.id ?? null, leadId: lead?.id ?? null })
      .onConflictDoNothing()
      .returning();
    conv ??= (await db.query.conversations.findFirst({ where: eq(conversations.phone, digits) }))!;
  } else if (!conv.clientId) {
    // A lead may have become a client since we last spoke.
    const { client } = await matchPhone(digits);
    if (client) [conv] = await db.update(conversations).set({ clientId: client.id, name: client.name }).where(eq(conversations.id, conv.id)).returning();
  }
  return conv;
}

/** Unknown number → new WhatsApp lead in the first office. */
export async function createLeadFor(conv: Conversation, profileName: string | null, firstMessage: string) {
  const [office] = await db.select().from(offices).orderBy(asc(offices.createdAt)).limit(1);
  if (!office) return conv;
  const [lead] = await db
    .insert(leads)
    .values({ name: profileName || `WhatsApp +${conv.phone}`, phone: `+${conv.phone}`, source: "WhatsApp", officeId: office.id, notes: `First WhatsApp message: ${firstMessage.slice(0, 500)}`, nextFollowUpAt: new Date() })
    .returning();
  const [updated] = await db.update(conversations).set({ leadId: lead.id, name: lead.name }).where(eq(conversations.id, conv.id)).returning();
  return updated;
}

export async function logMessage(values: typeof waMessages.$inferInsert) {
  const [m] = await db.insert(waMessages).values(values).onConflictDoNothing().returning();
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, values.conversationId));
  return m ?? null;
}

export function withinWindow(conv: Pick<Conversation, "lastInboundAt">) {
  return !!conv.lastInboundAt && Date.now() - conv.lastInboundAt.getTime() < DAY;
}

export type SendResult = { status: WaStatus; note: string };

/**
 * Sends a message to a conversation and records it.
 * Inside the 24-hour window: free text + photos. Outside: the approved template (no photos), if set up.
 */
export async function deliver(
  conv: Conversation,
  text: string,
  opts: { photos?: string[]; appUrl: string; intent?: string | null; authorId?: string | null; firstName?: string; existingMessageId?: string; sentStatus?: WaStatus },
): Promise<SendResult> {
  const record = async (status: WaStatus, waMessageId: string | null, error?: string, kind = "text") => {
    if (opts.existingMessageId) {
      await db.update(waMessages).set({ status, waMessageId, error: error ?? null, body: text, authorId: opts.authorId ?? undefined }).where(eq(waMessages.id, opts.existingMessageId));
      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    } else {
      await logMessage({ conversationId: conv.id, direction: "OUT", waMessageId, kind, body: text, intent: opts.intent ?? null, status, authorId: opts.authorId ?? null, error: error ?? null });
    }
  };

  if (!whatsappConfigured()) {
    await record("QUEUED", null, "WhatsApp not connected");
    return { status: "QUEUED", note: "queued — WhatsApp not connected yet" };
  }
  try {
    if (withinWindow(conv)) {
      const id = await sendText(conv.phone, text);
      await record(opts.sentStatus ?? "SENT", id);
      for (const url of (opts.photos ?? []).slice(0, 5)) {
        try {
          const pid = await sendImage(conv.phone, url, opts.appUrl);
          await logMessage({ conversationId: conv.id, direction: "OUT", waMessageId: pid, kind: "image", body: "", mediaUrl: url, status: "SENT", authorId: opts.authorId ?? null });
        } catch (e) {
          await logMessage({ conversationId: conv.id, direction: "OUT", kind: "image", body: "", mediaUrl: url, status: "FAILED", error: (e as Error).message, authorId: opts.authorId ?? null });
        }
      }
      return { status: opts.sentStatus ?? "SENT", note: "sent on WhatsApp" };
    }
    if (!templateConfigured()) {
      await record("QUEUED", null, "Client hasn't messaged in 24 hours and no template is set up");
      return { status: "QUEUED", note: "queued — client hasn't messaged in 24h (set up a WhatsApp template)" };
    }
    const id = await sendTemplate(conv.phone, opts.firstName ?? conv.name?.split(" ")[0] ?? "there", text);
    await record(opts.sentStatus ?? "SENT", id, undefined, "template");
    return { status: opts.sentStatus ?? "SENT", note: "sent on WhatsApp (template)" };
  } catch (e) {
    await record("FAILED", null, (e as Error).message);
    return { status: "FAILED", note: `failed: ${(e as Error).message}`.slice(0, 200) };
  }
}

/** Used by the voice desk and weekly summaries: send to a client by their saved phone. */
export async function notifyClient(client: { id: string; name: string; phone: string }, text: string, photos: string[], appUrl: string, authorId?: string | null) {
  const conv = await getConversation(client.phone);
  if (!conv.clientId) await db.update(conversations).set({ clientId: client.id, name: client.name }).where(eq(conversations.id, conv.id));
  return deliver(conv, text, { photos, appUrl, intent: "update", authorId, firstName: client.name.split(" ")[0] });
}
