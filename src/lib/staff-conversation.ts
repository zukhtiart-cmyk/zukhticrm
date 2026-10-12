import "server-only";
import { executeActions, planTurn } from "./assistant-core";
import {
  ACTION_LABEL,
  handoffHref,
  isShortNo,
  isShortYes,
  NO_RE,
  YES_RE,
  type AssistantAction,
} from "./assistant-types";
import { buildVoiceContext } from "./voice-context";
import { basicUnderstand, understand } from "./voice-ai";
import { applyVoiceUpdate } from "./voice-apply";
import type { VoiceProposal } from "./voice-types";
import type { Actor } from "./site-actions";

/**
 * The staff conversation with Zuki outside the app — on WhatsApp and on the desk device.
 * Same rules everywhere: Zuki asks for what's missing, reads it back, and saves only after a yes.
 */

export type Photo = { mediaId: string; mime: string };
export type ConvState = {
  actions: AssistantAction[];
  asking: { index: number; field: string } | null;
  photos: Record<number, Photo>;
  /** Project updates: the understood changes, shown before saving. */
  proposals: Record<number, { proposal: VoiceProposal; lines: string[] }>;
};
export const EMPTY_CONV: ConvState = {
  actions: [],
  asking: null,
  photos: {},
  proposals: {},
};
export type Conv = { state: ConvState; awaiting: boolean };
export type Mood = "idle" | "happy" | "concerned";

export type TurnResult = {
  kind: "saved" | "cleared" | "confirm" | "asked";
  next: Conv;
  /** Formatted for WhatsApp (bold, links). */
  text: string;
  /** What Zuki says out loud (device). */
  say: string;
  /** Short lines for a small screen. */
  lines: string[];
  mood: Mood;
  /** Zuki asked something and is waiting for the answer. */
  expectAnswer: boolean;
};

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
  st: ConvState,
  names: {
    project: (id?: string | null) => string;
    contractor: (id?: string | null) => string;
  },
  plain = false,
) {
  const b = (t: string) => (plain ? t : `*${t}*`);
  const n = plain
    ? ACTION_LABEL[a.type]
    : `${i + 1}. ${b(ACTION_LABEL[a.type])}`;
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

export async function staffTurn(
  user: Actor,
  conv: Conv,
  input: {
    text: string;
    channel: "whatsapp" | "device";
    appUrl: string;
    photo?: File | null;
    photoRef?: Photo | null;
    /** Photos are kept as references; fetch the file again at save time. */
    refetchPhoto?: (p: Photo) => Promise<File>;
  },
): Promise<TurnResult> {
  const { state, awaiting } = conv;
  const text = input.text.trim();
  let photo = input.photo ?? null;
  const device = input.channel === "device";
  const first = user.name.split(" ")[0].replace(/[()]/g, "");
  const yes = device ? isShortYes(text) : YES_RE.test(text);
  const no = device ? isShortNo(text) : NO_RE.test(text);

  // ---- Yes: save everything ----
  if (awaiting && !photo && yes) {
    const results: string[] = [];
    const lines: string[] = [];
    let ok = 0;
    let failed: string[] = [];
    const files: Record<number, File> = {};
    if (input.refetchPhoto)
      for (const [k, p] of Object.entries(state.photos)) {
        try {
          files[Number(k)] = await input.refetchPhoto(p);
        } catch (e) {
          console.error("re-fetch of photo failed", e);
        }
      }
    const out = await executeActions(
      user,
      state.actions,
      (i) => files[i] ?? null,
    ).catch((e) => ({
      error: (e as Error).message,
      results: [],
    }));
    if (out.error) {
      results.push(`✗ ${out.error}`);
      failed.push(out.error);
    }
    for (const r of out.results) {
      results.push(
        `${r.ok ? "✓" : "✗"} ${r.message}${r.ok && r.href ? `\n   ${input.appUrl}${r.href}` : ""}`,
      );
      lines.push(`${r.ok ? "✓" : "✗"} ${r.message}`);
      if (r.ok) ok++;
      else failed.push(r.message);
    }
    // Project updates save directly (internal only; the client isn't messaged).
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
        input.appUrl,
      );
      if (res.ok) {
        ok++;
        results.push(
          `✓ Project update saved (not sent to the client — send it from the Voice Desk if needed).\n   ${input.appUrl}/projects/${a.projectId}`,
        );
        lines.push("✓ Project update saved");
      } else {
        failed.push(`Project update: ${res.error}`);
        results.push(`✗ Project update: ${res.error}`);
        lines.push(`✗ Project update: ${res.error}`);
      }
    }
    // Leads, contractors and measurements are finished in the app.
    const handoffs = state.actions.filter(
      (x) =>
        x.type === "new_lead" ||
        x.type === "new_contractor" ||
        x.type === "measurements",
    );
    for (const a of handoffs) {
      results.push(
        `➜ ${ACTION_LABEL[a.type]}: finish here ${input.appUrl}${handoffHref(a)}`,
      );
      lines.push(`➜ ${ACTION_LABEL[a.type]}: finish it in the app`);
    }
    failed = failed.filter(Boolean);
    const say = failed.length
      ? `${ok ? `I saved ${ok}, but ` : ""}I couldn't save ${failed.length === 1 ? "one item" : `${failed.length} items`}: ${failed[0]}`
      : ok
        ? `Done, ${first} — ${ok === 1 ? "saved" : `all ${ok} saved`}.${handoffs.length ? " The rest needs finishing in the app." : " Anything else?"}`
        : handoffs.length
          ? "That one needs finishing in the app — I've noted where."
          : "There was nothing to save.";
    return {
      kind: "saved",
      next: { state: { ...EMPTY_CONV }, awaiting: false },
      text: results.join("\n") || "Nothing to save.",
      say,
      lines,
      mood: failed.length ? "concerned" : ok ? "happy" : "idle",
      expectAnswer: !failed.length && !!ok && !handoffs.length,
    };
  }

  // ---- No: clear ----
  if (no && !photo && (awaiting || state.actions.length)) {
    return {
      kind: "cleared",
      next: { state: { ...EMPTY_CONV }, awaiting: false },
      text: "OK, cleared. Tell me something new whenever you're ready.",
      say: "Okay, cancelled — nothing was saved. What next?",
      lines: ["Cancelled — nothing saved"],
      mood: "idle",
      expectAnswer: true,
    };
  }

  // ---- Understand ----
  const photoIdx = new Set(
    Object.keys(state.photos)
      .map(Number)
      .filter((i) => i < state.actions.length),
  );
  // A photo while a snag is waiting for one is that snag's photo.
  if (photo && input.photoRef && state.asking?.field === "photo") {
    state.photos[state.asking.index] = input.photoRef;
    photoIdx.add(state.asking.index);
    photo = null;
  }
  const turn = await planTurn(user, {
    text,
    actions: state.actions,
    asking: state.asking,
    photos: photoIdx,
    photo,
    channel: input.channel,
    noCamera: device,
  });
  const next: ConvState = {
    actions: turn.actions,
    asking: turn.asking,
    photos: {},
    proposals: {},
  };
  for (const [k, p] of Object.entries(state.photos))
    if (Number(k) < turn.actions.length) next.photos[Number(k)] = p;
  if (input.photoRef && turn.attachPhotoTo !== undefined && photo)
    next.photos[turn.attachPhotoTo] = input.photoRef;

  // Understand project updates now, so the person hears/sees exactly what will change.
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
  const waText = [
    turn.reply
      .replace(/Check (these \d+ items|the [^.]+) and tap Confirm\./, "")
      .replace(
        "Tap the camera button — or say “skip”.",
        "Send it here — or reply “skip”.",
      )
      .trim(),
    turn.actions.length
      ? turn.actions.map((a, i) => card(a, i, { ...next }, names)).join("\n")
      : "",
    ready
      ? "Reply *YES* to save, or tell me what to change. Reply *NO* to cancel."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Spoken: the read-back plus what a project update will change.
  const changes = Object.values(next.proposals).flatMap((p) => p.lines);
  let say = turn.reply;
  if (changes.length)
    say = say.replace(
      / Shall I save (it|them)\?$/,
      ` That's ${changes.join(", ")}. Shall I save $1?`,
    );
  const blockedOnly =
    !turn.actions.length &&
    /\b(only|can't|cannot|not allowed)\b/i.test(turn.reply);

  return {
    kind: ready ? "confirm" : "asked",
    next: { state: next, awaiting: ready },
    text: waText,
    say,
    lines: turn.actions.map((a, i) => card(a, i, next, names, true)),
    mood: blockedOnly ? "concerned" : "idle",
    expectAnswer: say.trim().endsWith("?"),
  };
}
