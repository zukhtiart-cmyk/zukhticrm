import "server-only";
import { eq } from "drizzle-orm";
import { assistantSessions, db, users } from "@/db";
import { can } from "./permissions";
import { executeActions, planTurn } from "./assistant-core";
import {
  ACTION_LABEL,
  handoffHref,
  type AssistantAction,
} from "./assistant-types";
import { buildVoiceContext } from "./voice-context";
import { basicUnderstand, transcribe, understand } from "./voice-ai";
import { applyVoiceUpdate } from "./voice-apply";
import { downloadMedia, normalizePhone, phoneKey, sendText } from "./whatsapp";
import type { VoiceProposal } from "./voice-types";
import type { InboundMessage } from "./wa-inbound";

/**
 * Zuki on WhatsApp for the team: staff message the company number (text, voice note or photo)
 * and Zuki files it exactly like the in-app assistant. Saves only after they reply YES.
 */

type Photo = { mediaId: string; mime: string };
type State = {
  actions: AssistantAction[];
  asking: { index: number; field: string } | null;
  photos: Record<number, Photo>;
  /** Project updates: the understood changes, shown before saving. */
  proposals: Record<number, { proposal: VoiceProposal; lines: string[] }>;
};
const EMPTY: State = { actions: [], asking: null, photos: {}, proposals: {} };
const EXPIRE_MS = 3 * 3600 * 1000;
const YES =
  /^(yes|y|yeah|yep|haan|ha|han|haa|ok|okay|save|confirm|done|theek hai|thik hai|sahi hai|👍)\b/i;
const NO =
  /^(no|nahi|nahin|cancel|stop|reset|clear|discard|chhodo|rehne do)\b/i;

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

function describeProposal(
  p: VoiceProposal,
  ctx: Awaited<ReturnType<typeof buildVoiceContext>>,
) {
  if (!ctx) return [];
  const c = ctx.ctx;
  const lines: string[] = [];
  for (const s of p.stageUpdates)
    lines.push(
      `${c.stages.find((x) => x.id === s.stageId)?.name ?? "Stage"} → ${s.status === "DONE" ? "done" : `${s.progress}%`}`,
    );
  for (const m of p.payments)
    lines.push(
      `Client payment: ${c.milestones.find((x) => x.id === m.milestoneId)?.label ?? "milestone"} ${c.project.currency} ${m.amount.toLocaleString("en-IN")}`,
    );
  for (const o of p.orders)
    lines.push(
      `Order: ${o.item} → ${o.status.toLowerCase().replace("_", " ")}${o.eta ? ` (ETA ${o.eta})` : ""}`,
    );
  for (const v of p.visits)
    lines.push(`Visit: ${v.title} ${v.at.replace("T", " ")}`);
  for (const i of p.issues.filter(Boolean)) lines.push(`Issue: ${i}`);
  return lines;
}

function card(
  a: AssistantAction,
  i: number,
  st: State,
  names: {
    project: (id?: string | null) => string;
    contractor: (id?: string | null) => string;
  },
) {
  const n = `${i + 1}. *${ACTION_LABEL[a.type]}*`;
  const amt = a.amount ? ` ₹${a.amount.toLocaleString("en-IN")}` : "";
  switch (a.type) {
    case "payment":
      return `${n}: ${amt} to ${names.contractor(a.contractorId)} for ${names.project(a.projectId)}${a.mode ? ` by ${a.mode}` : ""}${a.kind === "BILL" ? ` (pays bill ${a.billLabel})` : a.kind === "WAGES" ? " (wages)" : ""}`;
    case "expense":
      return `${n}: ${amt} — ${a.description ?? ""} (${names.project(a.projectId)})${st.photos[i] ? " 📷" : ""}`;
    case "snag":
      return `${n}: ${a.room ? `${a.room} — ` : ""}${a.description ?? ""} (${names.project(a.projectId)})${st.photos[i] ? " 📷" : ""}`;
    case "bill":
      return `${n}: ${amt} from ${names.contractor(a.contractorId)} for ${names.project(a.projectId)}${a.note ? ` — ${a.note}` : ""}`;
    case "project_update": {
      const lines = st.proposals[i]?.lines ?? [];
      return `${n} for ${names.project(a.projectId)}:${lines.length ? `\n   • ${lines.join("\n   • ")}` : ` “${a.text}”`}`;
    }
    default:
      return `${n}`;
  }
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
    if (!process.env.OPENAI_API_KEY) {
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

  // ---- YES / NO while waiting to save ----
  if (awaiting && !photo && YES.test(text)) {
    const results: string[] = [];
    // Photos come from WhatsApp; fetch them again at save time.
    const files: Record<number, File> = {};
    for (const [k, p] of Object.entries(state.photos)) {
      try {
        const blob = await downloadMedia(p.mediaId);
        files[Number(k)] = new File([blob], "whatsapp.jpg", { type: p.mime });
      } catch (e) {
        console.error("re-download of WhatsApp photo failed", e);
      }
    }
    const out = await executeActions(
      user,
      state.actions,
      (i) => files[i] ?? null,
    ).catch((e) => ({ error: (e as Error).message, results: [] }));
    if (out.error) results.push(`✗ ${out.error}`);
    for (const r of out.results)
      results.push(
        `${r.ok ? "✓" : "✗"} ${r.message}${r.ok && r.href ? `\n   ${appUrl}${r.href}` : ""}`,
      );
    // Project updates save directly from WhatsApp (internal only; the client isn't messaged).
    for (const [k, p] of Object.entries(state.proposals)) {
      const a = state.actions[Number(k)];
      if (!a || a.type !== "project_update" || !a.projectId) continue;
      const res = await applyVoiceUpdate(
        user,
        {
          ...p.proposal,
          projectId: a.projectId,
          transcript: a.text ?? "",
          audioUrl: null,
          photos: [],
          sendToClient: false,
          clientMessage: p.proposal.clientMessage ?? "",
        },
        appUrl,
      );
      results.push(
        res.ok
          ? `✓ Project update saved (not sent to the client — send it from the Voice Desk if needed).\n   ${appUrl}/projects/${a.projectId}`
          : `✗ Project update: ${res.error}`,
      );
    }
    // Leads / contractors still open in the app.
    for (const a of state.actions.filter(
      (x) =>
        x.type === "new_lead" ||
        x.type === "new_contractor" ||
        x.type === "measurements",
    ))
      results.push(
        `➜ ${ACTION_LABEL[a.type]}: finish here ${appUrl}${handoffHref(a)}`,
      );
    await store(user.id, { ...EMPTY }, false, seen);
    await reply(to, results.join("\n") || "Nothing to save.");
    return { action: "saved" as const };
  }
  if (NO.test(text) && !photo && (awaiting || state.actions.length)) {
    await store(user.id, { ...EMPTY }, false, seen);
    await reply(
      to,
      "OK, cleared. Tell me something new whenever you're ready.",
    );
    return { action: "cleared" as const };
  }

  // ---- Understand ----
  const photoIdx = new Set(
    Object.keys(state.photos)
      .map(Number)
      .filter((i) => i < state.actions.length),
  );
  // A photo while a snag is waiting for one is that snag's photo.
  if (photo && state.asking?.field === "photo") {
    state.photos[state.asking.index] = photoRef!;
    photoIdx.add(state.asking.index);
    photo = null;
  }
  const turn = await planTurn(user, {
    text,
    actions: state.actions,
    asking: state.asking,
    photos: photoIdx,
    photo,
  });
  const next: State = {
    actions: turn.actions,
    asking: turn.asking,
    photos: {},
    proposals: {},
  };
  // Keep photos attached to the same items (positions only shift when question cards are dropped, which come last).
  for (const [k, p] of Object.entries(state.photos))
    if (Number(k) < turn.actions.length) next.photos[Number(k)] = p;
  if (photoRef && turn.attachPhotoTo !== undefined && photo)
    next.photos[turn.attachPhotoTo] = photoRef;

  // Understand project updates now, so the person sees exactly what will change.
  for (const [i, a] of turn.actions.entries()) {
    if (a.type !== "project_update" || !a.projectId) continue;
    const built = await buildVoiceContext(a.projectId, user);
    if (!built) continue;
    let proposal: VoiceProposal;
    try {
      proposal = process.env.ANTHROPIC_API_KEY
        ? await understand(a.text ?? text, built.ctx)
        : basicUnderstand(a.text ?? text, built.ctx);
    } catch {
      proposal = basicUnderstand(a.text ?? text, built.ctx);
    }
    next.proposals[i] = { proposal, lines: describeProposal(proposal, built) };
  }

  const names = {
    project: (id?: string | null) =>
      turn.context.projects.find((p) => p.id === id)?.name ?? "?project",
    contractor: (id?: string | null) =>
      turn.context.contractors.find((c) => c.id === id)?.name ?? "?contractor",
  };
  const blocking = turn.missing.filter((m) => !m.optional);
  const ready = turn.actions.length > 0 && !blocking.length;
  const parts = [
    turn.reply
      .replace(/Check (these \d+ items|the [^.]+) and tap Confirm\./, "")
      .replace(
        "Tap the camera button — or say “skip”.",
        "Send it here — or reply “skip”.",
      )
      .trim(),
  ];
  if (turn.actions.length)
    parts.push(turn.actions.map((a, i) => card(a, i, next, names)).join("\n"));
  if (ready)
    parts.push(
      "Reply *YES* to save, or tell me what to change. Reply *NO* to cancel.",
    );
  await store(user.id, next, ready, seen);
  await reply(to, parts.filter(Boolean).join("\n\n"));
  return { action: ready ? ("confirm" as const) : ("asked" as const) };
}
