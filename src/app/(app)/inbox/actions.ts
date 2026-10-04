"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { conversations, db, waMessages } from "@/db";
import { requireUser } from "@/lib/auth";
import { appBaseUrl } from "@/lib/portal";
import { setSetting } from "@/lib/settings";
import { deliver } from "@/lib/wa-conversations";
import { loadConversation } from "@/lib/wa-inbox";
import { projectFacts } from "@/lib/wa-facts";

async function access(id: string) {
  const user = await requireUser("inbox");
  const conv = await loadConversation(id, user);
  if (!conv) throw new Error("Conversation not found");
  return { user, conv };
}

const done = (id: string) => {
  revalidatePath(`/inbox/${id}`);
  revalidatePath("/inbox");
  revalidatePath("/");
};

export async function sendReply(_: unknown, form: FormData) {
  const id = String(form.get("id"));
  const { user, conv } = await access(id);
  const text = String(form.get("text") ?? "").trim();
  if (!text) return { error: "Write a message first." };
  const res = await deliver(conv, text.slice(0, 4000), { appUrl: await appBaseUrl(), intent: "staff", authorId: user.id, firstName: conv.name?.split(" ")[0] });
  // A person replied: the conversation is handled.
  await db.update(conversations).set({ needsHuman: false }).where(eq(conversations.id, conv.id));
  done(id);
  return res.status === "SENT" ? { ok: "Sent." } : { error: `Not sent: ${res.note}` };
}

export async function approvePending(form: FormData) {
  const id = String(form.get("id"));
  const { user, conv } = await access(id);
  const msgId = String(form.get("messageId"));
  const msg = conv.messages.find((m) => m.id === msgId && m.status === "PENDING_APPROVAL");
  if (!msg) return;
  const text = String(form.get("text") ?? msg.body).trim() || msg.body;
  let photos: string[] = [];
  if (msg.mediaUrl) {
    try {
      photos = JSON.parse(msg.mediaUrl);
    } catch {
      photos = [];
    }
  }
  // Refresh photos at send time in case newer ones were shared since.
  if (photos.length && conv.activeProjectId) photos = (await projectFacts(conv.activeProjectId, await appBaseUrl()))?.latestPhotoUrls ?? photos;
  await deliver(conv, text, { appUrl: await appBaseUrl(), intent: msg.intent, authorId: user.id, existingMessageId: msg.id, photos, firstName: conv.name?.split(" ")[0] });
  done(id);
}

export async function discardPending(form: FormData) {
  const id = String(form.get("id"));
  const { conv } = await access(id);
  await db
    .update(waMessages)
    .set({ status: "DISCARDED" })
    .where(and(eq(waMessages.id, String(form.get("messageId"))), eq(waMessages.conversationId, conv.id), eq(waMessages.status, "PENDING_APPROVAL")));
  done(id);
}

export async function setAiPaused(form: FormData) {
  const id = String(form.get("id"));
  const { conv } = await access(id);
  const paused = form.get("paused") === "1";
  await db.update(conversations).set({ aiPaused: paused, needsHuman: paused ? conv.needsHuman : false }).where(eq(conversations.id, conv.id));
  done(id);
}

export async function markHandled(form: FormData) {
  const id = String(form.get("id"));
  const { conv } = await access(id);
  await db.update(conversations).set({ needsHuman: false }).where(eq(conversations.id, conv.id));
  done(id);
}

export async function saveWhatsappSettings(form: FormData) {
  await requireUser("admin");
  await setSetting("whatsappMode", form.get("whatsappMode") === "auto" ? "auto" : "approve");
  await setSetting("weeklySummary", form.get("weeklySummary") === "on");
  revalidatePath("/admin");
  revalidatePath("/inbox");
}
