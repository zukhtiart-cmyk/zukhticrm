import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  aiPlan,
  assistantContext,
  basicPlan,
  BLOCKED_TEXT,
  finalize,
} from "@/lib/assistant";
import {
  ACTION_LABEL,
  type AssistantAction,
  type AssistantReply,
} from "@/lib/assistant-types";
import { shortAiReason } from "@/lib/ai-errors";
import { transcribe } from "@/lib/voice-ai";

export const maxDuration = 60;

/**
 * Zuki, the one-point assistant: takes what was said (plus the actions so far) and returns the
 * updated actions and the next question. Nothing is saved here.
 */
export async function POST(req: Request) {
  const session = await getSession();
  const user = session
    ? await db.query.users.findFirst({ where: eq(users.id, session.userId) })
    : null;
  if (!user || !user.active || !can(user.role, "voice"))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData();
  let current: AssistantAction[] = [];
  try {
    const raw = JSON.parse(String(form.get("actions") ?? "[]"));
    if (Array.isArray(raw)) current = raw.slice(0, 10);
  } catch {}
  let asking: AssistantReply["asking"] = null;
  try {
    const a = JSON.parse(String(form.get("asking") ?? "null"));
    if (a && typeof a.index === "number" && typeof a.field === "string")
      asking = { index: a.index, field: a.field };
  } catch {}
  const photos = new Set(
    String(form.get("photos") ?? "")
      .split(",")
      .filter(Boolean)
      .map(Number),
  );

  let text = String(form.get("text") ?? "")
    .trim()
    .slice(0, 4000);
  let notice: string | undefined;
  const audio = form.get("audio");
  if (audio instanceof File && audio.size > 0) {
    try {
      text = [
        text,
        await transcribe(
          audio,
          "Interior design company: projects, contractors, payments in rupees/AED, snags, site expenses. Hindi, Hinglish or English.",
        ),
      ]
        .filter(Boolean)
        .join(" ");
    } catch (e) {
      if (!text)
        return NextResponse.json(
          { error: (e as Error).message, speechFailed: true },
          { status: 502 },
        );
    }
  }
  if (!text)
    return NextResponse.json(
      { error: "Nothing was heard — try again or type it." },
      { status: 400 },
    );

  const ctx = await assistantContext(user);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  let plan: { reply: string; actions: AssistantAction[] };
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      plan = await aiPlan(text, current, asking, ctx, user, today);
    } catch (e) {
      console.error("assistant AI failed", e);
      notice = `AI is unavailable right now (${shortAiReason(e)}), so basic mode is used — check the cards before saving.`;
      plan = basicPlan(text, current, asking, ctx);
    }
  } else plan = basicPlan(text, current, asking, ctx);

  const { actions, missing, blocked } = await finalize(
    plan.actions,
    ctx,
    photos,
  );
  const first = missing[0] ?? null;
  const blockedText = [...new Set(blocked)]
    .map((t) => BLOCKED_TEXT[t])
    .filter(Boolean)
    .join(" ");
  let reply: string;
  if (first) reply = [blockedText, first.question].filter(Boolean).join(" ");
  else if (actions.length)
    reply = [
      blockedText,
      plan.reply,
      `Check ${actions.length > 1 ? `these ${actions.length} items` : `the ${ACTION_LABEL[actions[0].type].toLowerCase()}`} and tap Confirm.`,
    ]
      .filter(Boolean)
      .join(" ");
  else
    reply =
      blockedText ||
      "Sorry, I didn't get what to do. Try e.g. “Paid 5,000 cash to Ramesh for Shah residence”.";

  const out: AssistantReply & { context: typeof ctx } = {
    reply,
    actions,
    missing,
    asking: first ? { index: first.index, field: first.field } : null,
    heard: text,
    notice,
    context: ctx,
  };
  return NextResponse.json(out);
}

/** Projects, contractors and allowed actions for the assistant panel's dropdowns. */
export async function GET() {
  const session = await getSession();
  const user = session
    ? await db.query.users.findFirst({ where: eq(users.id, session.userId) })
    : null;
  if (!user || !user.active || !can(user.role, "voice"))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json(await assistantContext(user));
}
