import "server-only";
import {
  aiPlan,
  assistantContext,
  basicPlan,
  BLOCKED_TEXT,
  finalize,
} from "./assistant";
import { answerQuestion, basicAnswer } from "./assistant-data";
import {
  ACTION_LABEL,
  HANDOFF,
  type AssistantAction,
  type AssistantContext,
  type AssistantReply,
  type HistoryTurn,
  isShortNo,
  isShortYes,
} from "./assistant-types";
import { money } from "./format";
import { shortAiReason } from "./ai-errors";
import { readPhoto } from "./vision";
import {
  addExpenseAs,
  addSnagAs,
  recordPaymentAs,
  submitBillAs,
  type Actor,
} from "./site-actions";

export type TurnInput = {
  text?: string;
  actions: AssistantAction[];
  asking: AssistantReply["asking"];
  /** Positions of actions that already have a photo attached. */
  photos: Set<number>;
  /** A new photo for Zuki to read. */
  photo?: File | null;
  /** The last few lines of the conversation, oldest first. */
  history?: HistoryTurn[];
  /** WhatsApp asks for YES itself, so the read-back doesn't end with a question there. */
  channel?: "app" | "whatsapp";
};

export type TurnOutput = AssistantReply & {
  context: AssistantContext;
  answers: string[];
  attachPhotoTo?: number;
};

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );

/** One step of the conversation with Zuki — used by the in-app panel and by WhatsApp. Saves nothing. */
export async function planTurn(
  user: Actor,
  input: TurnInput,
): Promise<TurnOutput> {
  const ctx = await assistantContext(user);
  const text = (input.text ?? "").trim().slice(0, 4000);
  let actions = input.actions.slice(0, 10);
  const photos = new Set(input.photos);
  let notice: string | undefined;
  let lead = "";
  let attachPhotoTo: number | undefined;

  // "Haan, save kar do" / "no, cancel" — answered without the AI.
  if (
    input.channel !== "whatsapp" &&
    !input.photo &&
    actions.length &&
    isShortNo(text)
  ) {
    return {
      reply: "Okay, cancelled — nothing was saved. What next?",
      actions: [],
      missing: [],
      asking: null,
      heard: text,
      context: ctx,
      answers: [],
      intent: "cancel",
    };
  }
  if (
    input.channel !== "whatsapp" &&
    !input.photo &&
    actions.length &&
    isShortYes(text)
  ) {
    const f = await finalize(actions, ctx, photos);
    if (!f.missing.some((m) => !m.optional))
      return {
        reply: "",
        actions: f.actions,
        missing: f.missing,
        asking: null,
        heard: text,
        context: ctx,
        answers: [],
        intent: "save",
        readyToSave: true,
      };
  }

  if (input.photo) {
    if (!process.env.ANTHROPIC_API_KEY) {
      lead =
        "Reading photos needs the AI to be switched on. You can still attach this photo on a card.";
    } else {
      try {
        const r = await readPhoto(input.photo, ctx, text || undefined);
        lead = r.reply;
        if (r.action) {
          if (ctx.allowed.includes(r.action.type)) {
            actions = [...actions, r.action];
            attachPhotoTo = actions.length - 1;
            photos.add(attachPhotoTo);
          } else lead = `${r.reply} ${BLOCKED_TEXT[r.action.type]}`;
        }
      } catch (e) {
        console.error("photo reading failed", e);
        lead = `I couldn't read the photo (${shortAiReason(e)}).`;
      }
    }
  } else if (text) {
    let plan: { reply: string; actions: AssistantAction[] };
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        plan = await aiPlan(
          text,
          actions,
          input.asking,
          ctx,
          user,
          today(),
          input.history ?? [],
        );
      } catch (e) {
        console.error("assistant AI failed", e);
        notice = `AI is unavailable right now (${shortAiReason(e)}), so basic mode is used — check the cards before saving.`;
        plan = basicPlan(text, actions, input.asking, ctx);
      }
    } else {
      const chat = smallTalk(text, user.name);
      plan = chat
        ? { reply: chat, actions }
        : basicPlan(text, actions, input.asking, ctx);
    }
    actions = plan.actions;
    lead = plan.reply;
  }

  // Questions are answered now and don't stay as cards.
  const answers: string[] = [];
  for (const q of actions.filter((a) => a.type === "question")) {
    const asked = q.text || text;
    try {
      answers.push(
        process.env.ANTHROPIC_API_KEY && !notice
          ? await answerQuestion(user, asked, ctx)
          : await basicAnswer(
              user,
              asked,
              q.projectId ?? null,
              q.contractorId ?? null,
            ),
      );
    } catch (e) {
      console.error("answer failed", e);
      answers.push(
        await basicAnswer(
          user,
          asked,
          q.projectId ?? null,
          q.contractorId ?? null,
        ),
      );
    }
  }
  // Keep photo positions in step when question cards are removed.
  const keptIdx: number[] = [];
  actions = actions.filter((a, i) =>
    a.type === "question" ? false : (keptIdx.push(i), true),
  );
  const remap = new Map(keptIdx.map((old, now) => [old, now]));
  const photosNow = new Set(
    [...photos].filter((i) => remap.has(i)).map((i) => remap.get(i)!),
  );
  if (attachPhotoTo !== undefined) attachPhotoTo = remap.get(attachPhotoTo);

  const {
    actions: final,
    missing,
    blocked,
  } = await finalize(actions, ctx, photosNow);
  const first = missing.find((m) => !m.optional) ?? missing[0] ?? null;
  const blockedText = [...new Set(blocked)]
    .map((t) => BLOCKED_TEXT[t])
    .filter(Boolean)
    .join(" ");
  const savable = final.filter((a) => !HANDOFF.includes(a.type));
  const readyToSave = !!savable.length && !missing.some((m) => !m.optional);
  // A short human acknowledgement from the AI ("Got it, Ramesh ji."), then the facts, built here so they're exact.
  // Don't open every reply the same way ("Got it. … Got it. …") — skip an acknowledgement Zuki just used.
  const lastZuki =
    [...(input.history ?? [])].reverse().find((h) => h.who === "zuki")?.text ??
    "";
  const ack =
    input.photo ||
    (lead &&
      lead.length < 40 &&
      lastZuki.toLowerCase().startsWith(lead.toLowerCase()))
      ? ""
      : lead;
  const parts: string[] = [];
  if (answers.length) parts.push(answers.join("\n\n"));
  if (blockedText) parts.push(blockedText);
  if (first)
    parts.push(
      [input.photo ? lead : ack, first.question].filter(Boolean).join(" "),
    );
  else if (final.length) {
    const readback = readBack(final, ctx);
    const handoffOnly = !savable.length;
    parts.push(
      [
        input.photo ? lead : answers.length ? "" : ack,
        handoffOnly
          ? `${readback} I'll open it so you can check and finish.`
          : input.channel === "whatsapp"
            ? readback
            : `${readback} Shall I save ${savable.length > 1 ? "them" : "it"}?`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  } else if (!answers.length && !blockedText)
    parts.push(
      lead ||
        "Sorry, I didn't catch what to do. You can say something like “Paid 5,000 cash to Ramesh for Shah residence”, or ask “What's Ramesh's balance?”",
    );

  return {
    reply: parts.filter(Boolean).join("\n\n"),
    actions: final,
    missing,
    asking: first ? { index: first.index, field: first.field } : null,
    heard: text,
    notice,
    context: ctx,
    answers,
    attachPhotoTo,
    readyToSave,
    intent: null,
  };
}

/** Friendly replies to plain chat when the AI is off. */
function smallTalk(text: string, name: string) {
  const first = name.split(" ")[0];
  const t = text.toLowerCase().trim();
  // Only short, plain chat — "hi, paid 500 to Ramesh" is an instruction.
  if (/\d/.test(t) || t.split(/\s+/).length > 5) return null;
  if (
    /^(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|salaam|hii+)\b/.test(
      t,
    )
  )
    return `Hi ${first}! What's happening on site?`;
  if (/\b(thanks|thank you|thank u|shukriya|dhanyavaad|thx)\b/.test(t))
    return `Anytime, ${first}. Anything else?`;
  if (/how are you|kaise ho|kya haal/.test(t))
    return `All good here, ready when you are. What do you need?`;
  if (/^(bye|that'?s all|bas|ho gaya|nothing|kuch nahi)\b/.test(t))
    return `Okay ${first}, talk soon.`;
  return null;
}

/** Says back what will be saved, the way a colleague would: "₹5,000 cash to Ramesh Carpentry Works for Shah residence." */
export function readBack(actions: AssistantAction[], ctx: AssistantContext) {
  const found = (id?: string | null) => ctx.projects.find((p) => p.id === id);
  // Spoken names are short: "Shah residence", not "Shah residence, Bandra West".
  const proj = (id?: string | null) => {
    const p = found(id);
    return p ? { ...p, name: p.name.split(",")[0].trim() } : undefined;
  };
  const who = (id?: string | null) =>
    ctx.contractors.find((c) => c.id === id)?.name;
  const amt = (a: AssistantAction) =>
    a.amount ? money(a.amount, proj(a.projectId)?.currency ?? "INR") : "";
  const at = (a: AssistantAction) =>
    proj(a.projectId) ? ` for ${proj(a.projectId)!.name}` : "";
  const one = (a: AssistantAction) => {
    switch (a.type) {
      case "payment": {
        const kind =
          a.kind === "WAGES"
            ? " as wages"
            : a.kind === "ADVANCE"
              ? " as an advance"
              : a.kind === "BILL"
                ? " against their approved bill"
                : "";
        return `${amt(a)}${a.mode ? ` by ${a.mode.toLowerCase() === "cash" ? "cash" : a.mode}` : ""} to ${who(a.contractorId) ?? "the contractor"}${at(a)}${kind}`;
      }
      case "expense": {
        // Skip the description when it's just the whole sentence repeated (basic mode).
        const d = a.description?.trim();
        const useD = d && d.length <= 45 && !/\d{3,}/.test(d);
        return `a site expense of ${amt(a)}${useD ? ` for ${d!.charAt(0).toLowerCase()}${d!.slice(1)}` : ""}${proj(a.projectId) ? ` at ${proj(a.projectId)!.name}` : ""}`;
      }
      case "snag":
        return `a snag at ${proj(a.projectId)?.name ?? "the site"}${a.room ? `, ${a.room}` : ""}${a.description ? ` — ${a.description}` : ""}`;
      case "bill": {
        const wo = ctx.workOrders.find((w) => w.id === a.workOrderId);
        return `a running bill of ${amt(a)} from ${who(a.contractorId) ?? "the contractor"}${wo ? ` on ${wo.number}` : ""}`;
      }
      case "project_update":
        return `the site update${at(a)}`;
      case "new_lead":
        return "the new lead";
      case "new_contractor":
        return "the new contractor";
      case "measurements":
        return `the measurements${at(a)}`;
      case "open":
        return `${proj(a.projectId)?.name ?? who(a.contractorId) ?? "that page"}`;
      default:
        return ACTION_LABEL[a.type].toLowerCase();
    }
  };
  const items = actions.map(one);
  const list =
    items.length <= 1
      ? (items[0] ?? "")
      : `${items.slice(0, -1).join("; ")}; and ${items[items.length - 1]}`;
  const s = list.charAt(0).toUpperCase() + list.slice(1);
  return s ? `${s}.` : "";
}

export type ExecResult = {
  index: number;
  ok: boolean;
  message: string;
  href?: string;
};

/** Saves confirmed actions with the same rules as the screens. Hand-offs are skipped. */
export async function executeActions(
  user: Actor,
  raw: AssistantAction[],
  photoAt: (i: number) => File | null,
): Promise<{ error?: string; results: ExecResult[] }> {
  const ctx = await assistantContext(user);
  const allowed = raw
    .slice(0, 10)
    .map((a, i) => ({ a, i }))
    .filter((x) => ctx.allowed.includes(x.a.type));
  const photos = new Set(
    allowed.map((x, j) => (photoAt(x.i) ? j : -1)).filter((j) => j >= 0),
  );
  const { actions, missing } = await finalize(
    allowed.map((x) => x.a),
    ctx,
    photos,
  );
  const blocking = missing.filter((m) => !m.optional);
  if (blocking.length)
    return {
      error: `Still needed: ${blocking.map((m) => `${m.label} (item ${m.index + 1})`).join(", ")}`,
      results: [],
    };

  const results: ExecResult[] = [];
  for (const [j, a] of actions.entries()) {
    if (HANDOFF.includes(a.type)) continue;
    const i = allowed[j].i;
    const photo = photoAt(i);
    const fd = new FormData();
    try {
      if (a.type === "payment") {
        fd.set("contractorId", a.contractorId!);
        fd.set("projectId", a.projectId!);
        fd.set("kind", a.kind ?? "ADVANCE");
        if (a.billId) fd.set("billId", a.billId);
        fd.set("amount", String(a.amount));
        fd.set("mode", a.mode!);
        if (a.reference) fd.set("reference", a.reference);
        if (a.note) fd.set("note", a.note.slice(0, 500));
        if (photo) fd.set("receipt", photo);
        const r = await recordPaymentAs(user, fd);
        results.push({
          index: i,
          ok: !r?.error,
          message: r?.error ?? r?.ok ?? "Saved",
          href: `/desk/contractors/${a.contractorId}#ledger`,
        });
      } else if (a.type === "expense") {
        fd.set("projectId", a.projectId!);
        fd.set("category", a.category ?? "Other");
        fd.set("description", (a.description ?? "").slice(0, 300));
        if (a.paidTo) fd.set("paidTo", a.paidTo.slice(0, 120));
        fd.set("amount", String(a.amount));
        if (photo) fd.set("bill", photo);
        const r = await addExpenseAs(user, fd);
        results.push({
          index: i,
          ok: !r?.error,
          message: r?.error ?? r?.ok ?? "Saved",
          href: `/desk/expenses?project=${a.projectId}`,
        });
      } else if (a.type === "snag") {
        fd.set("projectId", a.projectId!);
        fd.set("room", a.room ?? "General");
        fd.set("description", (a.description ?? "").slice(0, 500));
        if (a.contractorId) fd.set("contractorId", a.contractorId);
        if (photo) fd.set("photo", photo);
        const r = await addSnagAs(user, fd);
        results.push({
          index: i,
          ok: !r?.error,
          message: r?.error ?? r?.ok ?? "Saved",
          href: `/desk/snags?project=${a.projectId}`,
        });
      } else if (a.type === "bill") {
        fd.set("workOrderId", a.workOrderId!);
        fd.set("amount", String(a.amount));
        if (a.note) fd.set("note", a.note.slice(0, 300));
        if (photo) fd.set("bill", photo);
        const r = await submitBillAs(user, fd);
        const wo = ctx.workOrders.find((w) => w.id === a.workOrderId);
        results.push({
          index: i,
          ok: !r?.error,
          message: r?.error ?? r?.ok ?? "Saved",
          href: wo ? `/desk/contractors/wo/${wo.number}` : undefined,
        });
      }
    } catch (e) {
      results.push({
        index: i,
        ok: false,
        message: (e as Error).message.slice(0, 200),
      });
    }
  }
  return { results };
}
