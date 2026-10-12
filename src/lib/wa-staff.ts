import "server-only";
import { eq } from "drizzle-orm";
import { assistantSessions, db, users } from "@/db";
import { can } from "./permissions";
import { canTranscribe, transcribe } from "./voice-ai";
import { downloadMedia, normalizePhone, phoneKey, sendText } from "./whatsapp";
import type { InboundMessage } from "./wa-inbound";
import {
  EMPTY_CONV,
  staffTurn,
  type ConvState,
  type Photo,
} from "./staff-conversation";

/**
 * Zuki on WhatsApp for the team: staff message the company number (text, voice note or photo)
 * and Zuki files it exactly like the in-app assistant. Saves only after they reply YES.
 */

type State = ConvState;
const EMPTY: State = EMPTY_CONV;
const EXPIRE_MS = 3 * 3600 * 1000;

/** The active staff member who owns this WhatsApp number, if any. */
export async function staffForPhone(from: string) {
  const digits = normalizePhone(from);
  const rows = await db.select().from(users).where(eq(users.active, true));
  // Match with or without the country code.
  return (
    rows.find(
      (u) =>
        u.phone &&
        (normalizePhone(u.phone) === digits ||
          (normalizePhone(u.phone).length >= 10 &&
            phoneKey(u.phone) === phoneKey(digits))) &&
        can(u.role, "voice"),
    ) ?? null
  );
}

async function load(userId: string) {
  const row = await db.query.assistantSessions.findFirst({
    where: eq(assistantSessions.userId, userId),
  });
  if (!row)
    return { state: { ...EMPTY }, awaiting: false, seen: [] as string[] };
  const fresh = Date.now() - row.updatedAt.getTime() < EXPIRE_MS;
  return {
    state: fresh
      ? ({ ...EMPTY, ...(row.state as Partial<State>) } as State)
      : { ...EMPTY },
    awaiting: fresh && row.awaitingConfirm,
    seen: row.seenIds ?? [],
  };
}

async function store(
  userId: string,
  state: State,
  awaiting: boolean,
  seen: string[],
) {
  const values = {
    userId,
    state,
    awaitingConfirm: awaiting,
    seenIds: seen.slice(-30),
    updatedAt: new Date(),
  };
  await db
    .insert(assistantSessions)
    .values(values)
    .onConflictDoUpdate({ target: assistantSessions.userId, set: values });
}

async function reply(to: string, text: string) {
  try {
    await sendText(to, text.slice(0, 3900));
  } catch (e) {
    console.error("staff whatsapp reply failed", e);
  }
}

export async function handleStaffMessage(
  user: NonNullable<Awaited<ReturnType<typeof staffForPhone>>>,
  msg: InboundMessage,
  appUrl: string,
) {
  const { state, awaiting, seen } = await load(user.id);
  if (seen.includes(msg.id)) return { action: "duplicate" as const };
  seen.push(msg.id);
  const to = msg.from;

  // ---- Read the message ----
  let text = "";
  let photo: File | null = null;
  let photoRef: Photo | null = null;
  if (msg.type === "text") text = msg.text?.body ?? "";
  else if (msg.type === "button") text = msg.button?.text ?? "";
  else if (msg.type === "interactive")
    text =
      msg.interactive?.button_reply?.title ??
      msg.interactive?.list_reply?.title ??
      "";
  else if (msg.type === "audio" && msg.audio?.id) {
    if (!canTranscribe()) {
      await store(user.id, state, awaiting, seen);
      await reply(
        to,
        "I can't listen to voice notes yet (voice-to-text isn't switched on). Please type it, or use your keyboard's 🎤 to dictate.",
      );
      return { action: "no-voice" as const };
    }
    try {
      const blob = await downloadMedia(msg.audio.id);
      text = await transcribe(
        new File([blob], "voice.ogg", {
          type: msg.audio.mime_type ?? "audio/ogg",
        }),
        "Interior design site team: projects, contractors, payments in rupees, snags, expenses. Hindi, Hinglish or English.",
      );
    } catch (e) {
      await store(user.id, state, awaiting, seen);
      await reply(
        to,
        `Couldn't understand the voice note (${(e as Error).message.slice(0, 120)}). Please type it.`,
      );
      return { action: "voice-failed" as const };
    }
  } else if (msg.type === "image" && msg.image?.id) {
    text = msg.image.caption ?? "";
    try {
      const blob = await downloadMedia(msg.image.id);
      photo = new File([blob], "whatsapp.jpg", {
        type: blob.type || "image/jpeg",
      });
      photoRef = { mediaId: msg.image.id, mime: blob.type || "image/jpeg" };
    } catch (e) {
      await store(user.id, state, awaiting, seen);
      await reply(
        to,
        `Couldn't download the photo (${(e as Error).message.slice(0, 120)}). Please send it again.`,
      );
      return { action: "photo-failed" as const };
    }
  } else {
    await store(user.id, state, awaiting, seen);
    await reply(
      to,
      "Send me text, a voice note or a photo. For example: “Paid 5,000 cash to Ramesh for Shah residence”, or a photo of a bill.",
    );
    return { action: "unsupported" as const };
  }
  text = text.trim();

  const out = await staffTurn(
    user,
    { state, awaiting },
    {
      text,
      channel: "whatsapp",
      appUrl,
      photo,
      photoRef,
      refetchPhoto: async (p) => {
        const blob = await downloadMedia(p.mediaId);
        return new File([blob], "whatsapp.jpg", { type: p.mime });
      },
    },
  );
  await store(user.id, out.next.state, out.next.awaiting, seen);
  await reply(to, out.text);
  return {
    action:
      out.kind === "confirm"
        ? ("confirm" as const)
        : out.kind === "asked"
          ? ("asked" as const)
          : out.kind,
  };
}
