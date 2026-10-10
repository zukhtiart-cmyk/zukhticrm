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
} from "./assistant-types";
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
        plan = await aiPlan(text, actions, input.asking, ctx, user, today());
      } catch (e) {
        console.error("assistant AI failed", e);
        notice = `AI is unavailable right now (${shortAiReason(e)}), so basic mode is used — check the cards before saving.`;
        plan = basicPlan(text, actions, input.asking, ctx);
      }
    } else plan = basicPlan(text, actions, input.asking, ctx);
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
  const parts: string[] = [];
  if (answers.length) parts.push(answers.join("\n\n"));
  if (blockedText) parts.push(blockedText);
  if (first)
    parts.push(
      input.photo && lead ? `${lead} ${first.question}` : first.question,
    );
  else if (final.length) {
    const savable = final.filter((a) => !HANDOFF.includes(a.type)).length;
    parts.push(
      [
        input.photo ? lead : answers.length ? "" : lead,
        savable
          ? `Check ${final.length > 1 ? `these ${final.length} items` : `the ${ACTION_LABEL[final[0].type].toLowerCase()}`} and tap Confirm.`
          : "Tap Open to continue.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  } else if (!answers.length)
    parts.push(
      lead ||
        blockedText ||
        "Sorry, I didn't get what to do. Try e.g. “Paid 5,000 cash to Ramesh for Shah residence” or ask “What's Ramesh's balance?”",
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
  };
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
