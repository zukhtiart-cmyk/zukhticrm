import "server-only";
import { desc, eq } from "drizzle-orm";
import { conversations, db, waMessages } from "@/db";
import { getSettings } from "./settings";
import {
  activeProjectsFor,
  createLeadFor,
  deliver,
  getConversation,
  logMessage,
  type Conversation,
} from "./wa-conversations";
import { decideReply, HANDOVER_REPLY } from "./wa-assistant";
import { projectFacts } from "./wa-facts";
import { downloadMedia, markRead } from "./whatsapp";
import { transcribe } from "./voice-ai";
import { handleStaffMessage, staffForPhone } from "./wa-staff";

/** One message as WhatsApp delivers it to the webhook. */
export type InboundMessage = {
  id: string;
  from: string;
  type: string;
  timestamp?: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: {
    button_reply?: { title: string };
    list_reply?: { title: string };
  };
  audio?: { id: string; mime_type?: string };
  image?: { id: string; caption?: string };
  document?: { id: string; caption?: string; filename?: string };
  video?: { id: string; caption?: string };
};

const LEAD_GREETING = (name: string | null) =>
  `Hello${name ? ` ${name.split(" ")[0]}` : ""}, thank you for contacting *Zukhti Home* — turnkey interiors in Mumbai, Dubai and beyond. 🏡\nA designer will get in touch with you shortly. Meanwhile, could you share your city, property type and approximate budget?`;

async function update(
  conv: Conversation,
  values: Partial<typeof conversations.$inferInsert>,
) {
  const [c] = await db
    .update(conversations)
    .set(values)
    .where(eq(conversations.id, conv.id))
    .returning();
  return c;
}

async function readText(
  msg: InboundMessage,
): Promise<{ text: string; kind: string; understood: boolean }> {
  switch (msg.type) {
    case "text":
      return { text: msg.text?.body ?? "", kind: "text", understood: true };
    case "button":
      return { text: msg.button?.text ?? "", kind: "text", understood: true };
    case "interactive":
      return {
        text:
          msg.interactive?.button_reply?.title ??
          msg.interactive?.list_reply?.title ??
          "",
        kind: "text",
        understood: true,
      };
    case "audio":
      if (process.env.OPENAI_API_KEY && msg.audio?.id) {
        try {
          const blob = await downloadMedia(msg.audio.id);
          const ext = (msg.audio.mime_type ?? "audio/ogg").includes("mpeg")
            ? "mp3"
            : "ogg";
          const text = await transcribe(
            new File([blob], `voice.${ext}`, {
              type: msg.audio.mime_type ?? "audio/ogg",
            }),
            "WhatsApp voice note from an interior design client.",
          );
          if (text) return { text, kind: "audio", understood: true };
        } catch (e) {
          console.error("whatsapp voice note transcription failed", e);
        }
      }
      return { text: "[voice note]", kind: "audio", understood: false };
    case "image":
      return {
        text: msg.image?.caption ? `[photo] ${msg.image.caption}` : "[photo]",
        kind: "image",
        understood: false,
      };
    case "document":
      return {
        text: `[document] ${msg.document?.filename ?? msg.document?.caption ?? ""}`.trim(),
        kind: "document",
        understood: false,
      };
    case "video":
      return { text: "[video]", kind: "video", understood: false };
    default:
      return { text: `[${msg.type}]`, kind: msg.type, understood: false };
  }
}

/** Handles one incoming WhatsApp message end to end. Safe to call twice for the same message. */
export async function handleInbound(
  msg: InboundMessage,
  profileName: string | null,
  appUrl: string,
) {
  // Team members talk to Zuki (the internal assistant), not the client assistant.
  const staff = await staffForPhone(msg.from);
  if (staff) {
    await markRead(msg.id);
    return handleStaffMessage(staff, msg, appUrl);
  }
  let conv = await getConversation(msg.from, profileName);
  const { text, kind, understood } = await readText(msg);

  const logged = await logMessage({
    conversationId: conv.id,
    direction: "IN",
    waMessageId: msg.id,
    kind,
    body: text,
    status: "RECEIVED",
  });
  if (!logged) return { action: "duplicate" as const };
  conv = await update(conv, { lastInboundAt: new Date() });
  await markRead(msg.id);
  const settings = await getSettings();

  // Fixed, safe texts go out straight away even in approval mode.
  const sendNow = (body: string, intent: string) =>
    deliver(conv, body, {
      appUrl,
      intent,
      firstName: conv.name?.split(" ")[0],
    });

  // ---- Not a client yet ----
  if (!conv.clientId) {
    if (!conv.leadId) {
      conv = await createLeadFor(conv, profileName, text);
      conv = await update(conv, { needsHuman: true });
      await sendNow(LEAD_GREETING(profileName), "lead_greeting");
      return { action: "new_lead" as const };
    }
    await update(conv, { needsHuman: true });
    return { action: "lead_message" as const };
  }

  // ---- Client handed to a person ----
  if (conv.aiPaused) {
    await update(conv, { needsHuman: true });
    return { action: "paused" as const };
  }

  // ---- Media we can't read → a person looks at it ----
  if (!understood) {
    await update(conv, { needsHuman: true });
    await sendNow(
      `Thank you${conv.name ? ` ${conv.name.split(" ")[0]}` : ""}, we've received it. Your project manager will look at it shortly. (For instant updates, type your question, e.g. "status" or "photos".)`,
      "media_received",
    );
    return { action: "media" as const };
  }

  // ---- Which project? ----
  const active = await activeProjectsFor(conv.clientId);
  if (!active.length) {
    await update(conv, { needsHuman: true });
    await sendNow(
      `Thank you for your message. Your project manager will reply shortly.`,
      "no_active_project",
    );
    return { action: "no_project" as const };
  }
  let question = text;
  let projectId: string | null = null;
  const choiceList = () =>
    `You have more than one project with us. Which one is this about?\n${active.map((p, i) => `${i + 1}. ${p.name}`).join("\n")}\nReply with the number.`;

  if (conv.awaitingProjectChoice) {
    const n = Number(text.trim().match(/^\d+/)?.[0]);
    if (n >= 1 && n <= active.length) {
      projectId = active[n - 1].id;
      conv = await update(conv, {
        activeProjectId: projectId,
        awaitingProjectChoice: false,
      });
      // Answer the question they asked before choosing.
      const before = await db.query.waMessages.findMany({
        where: eq(waMessages.conversationId, conv.id),
        orderBy: desc(waMessages.createdAt),
        limit: 4,
      });
      question =
        before.find((m) => m.direction === "IN" && m.id !== logged.id)?.body ||
        "status";
    } else {
      await sendNow(choiceList(), "choose_project");
      return { action: "ask_project" as const };
    }
  } else if (
    active.length > 1 &&
    /\b(change|switch|other|another)\b.*\bproject\b/i.test(text)
  ) {
    await update(conv, { awaitingProjectChoice: true });
    await sendNow(choiceList(), "choose_project");
    return { action: "ask_project" as const };
  } else if (active.length === 1) {
    projectId = active[0].id;
    if (conv.activeProjectId !== projectId)
      conv = await update(conv, { activeProjectId: projectId });
  } else if (
    conv.activeProjectId &&
    active.some((p) => p.id === conv.activeProjectId)
  ) {
    projectId = conv.activeProjectId;
  } else {
    await update(conv, { awaitingProjectChoice: true });
    await sendNow(choiceList(), "choose_project");
    return { action: "ask_project" as const };
  }

  // ---- Answer from live project data ----
  const facts = await projectFacts(projectId!, appUrl);
  if (!facts) return { action: "error" as const };
  const history = (
    await db.query.waMessages.findMany({
      where: eq(waMessages.conversationId, conv.id),
      orderBy: desc(waMessages.createdAt),
      limit: 8,
    })
  )
    .reverse()
    .filter((m) => m.id !== logged.id && m.body)
    .map((m) => ({ direction: m.direction, body: m.body }));
  const decision = await decideReply(question, facts, history);
  await db
    .update(waMessages)
    .set({ intent: decision.intent })
    .where(eq(waMessages.id, logged.id));

  if (decision.handover) {
    // Asking for a person pauses the assistant; other hand-overs just flag the conversation.
    conv = await update(conv, {
      needsHuman: true,
      aiPaused: decision.intent === "human",
    });
    if (decision.intent === "human") {
      await sendNow(
        HANDOVER_REPLY(facts.clientFirstName, facts.projectManager),
        "human",
      );
      return { action: "handover" as const };
    }
  }

  if (settings.whatsappMode === "approve") {
    await logMessage({
      conversationId: conv.id,
      direction: "OUT",
      kind: decision.sendPhotos ? "text+photos" : "text",
      body: decision.reply,
      intent: decision.intent,
      status: "PENDING_APPROVAL",
      mediaUrl: decision.sendPhotos
        ? JSON.stringify(facts.latestPhotoUrls)
        : null,
    });
    return { action: "pending_approval" as const, decision };
  }
  await deliver(conv, decision.reply, {
    photos: decision.sendPhotos ? facts.latestPhotoUrls : [],
    appUrl,
    intent: decision.intent,
    firstName: facts.clientFirstName,
    sentStatus: "AUTO_REPLIED",
  });
  return { action: "auto_replied" as const, decision };
}
