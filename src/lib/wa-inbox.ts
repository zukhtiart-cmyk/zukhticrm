import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { conversations, db, waMessages } from "@/db";
import { officeScope } from "./permissions";
import type { Role } from "@/db/schema";

type Viewer = { role: Role; officeId: string | null };

async function allWithLinks() {
  return db.query.conversations.findMany({
    with: { client: true, lead: true, activeProject: true },
    orderBy: desc(conversations.lastMessageAt),
    limit: 300,
  });
}

/** Staff outside head office see conversations for their office's clients and leads (plus unknown numbers). */
function visible(viewer: Viewer, c: Awaited<ReturnType<typeof allWithLinks>>[number]) {
  const scope = officeScope(viewer);
  if (!scope) return true;
  const office = c.client?.officeId ?? c.lead?.officeId ?? null;
  return office === null || office === scope;
}

export async function listConversations(viewer: Viewer) {
  const rows = (await allWithLinks()).filter((c) => visible(viewer, c));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const msgs = await db
    .select({ conversationId: waMessages.conversationId, body: waMessages.body, direction: waMessages.direction, status: waMessages.status, createdAt: waMessages.createdAt })
    .from(waMessages)
    .where(inArray(waMessages.conversationId, ids))
    .orderBy(desc(waMessages.createdAt));
  const last = new Map<string, (typeof msgs)[number]>();
  const pending = new Map<string, number>();
  for (const m of msgs) {
    if (!last.has(m.conversationId)) last.set(m.conversationId, m);
    if (m.status === "PENDING_APPROVAL") pending.set(m.conversationId, (pending.get(m.conversationId) ?? 0) + 1);
  }
  return rows.map((c) => ({ ...c, last: last.get(c.id) ?? null, pending: pending.get(c.id) ?? 0 }));
}

/** Conversations needing a person or with replies waiting for approval. */
export async function inboxAttentionCount(viewer: Viewer) {
  try {
    const list = await listConversations(viewer);
    return list.filter((c) => c.needsHuman || c.pending > 0).length;
  } catch {
    return 0;
  }
}

export async function loadConversation(id: string, viewer: Viewer) {
  const c = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
    with: { client: true, lead: true, activeProject: true, messages: { orderBy: asc(waMessages.createdAt), with: { author: true } } },
  });
  if (!c) return null;
  if (!visible(viewer, { ...c, activeProject: c.activeProject })) return null;
  return c;
}
