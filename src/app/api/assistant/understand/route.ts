import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assistantContext } from "@/lib/assistant";
import { planTurn } from "@/lib/assistant-core";
import type { AssistantAction, AssistantReply } from "@/lib/assistant-types";
import { transcribe } from "@/lib/voice-ai";

export const maxDuration = 60;

async function currentUser() {
  const session = await getSession();
  const user = session
    ? await db.query.users.findFirst({ where: eq(users.id, session.userId) })
    : null;
  return user && user.active && can(user.role, "voice") ? user : null;
}

/**
 * Zuki, the one-point assistant: takes what was said (or a photo) plus the actions so far, and returns the
 * updated actions, answers to any questions, and the next question. Nothing is saved here.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData();
  let actions: AssistantAction[] = [];
  try {
    const raw = JSON.parse(String(form.get("actions") ?? "[]"));
    if (Array.isArray(raw)) actions = raw.slice(0, 10);
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
  const photoField = form.get("photo");
  const photo =
    photoField instanceof File && photoField.size > 0 ? photoField : null;
  if (
    photo &&
    (!photo.type.startsWith("image/") || photo.size > 15 * 1024 * 1024)
  )
    return NextResponse.json(
      { error: "Send a photo under 15 MB." },
      { status: 400 },
    );

  let text = String(form.get("text") ?? "")
    .trim()
    .slice(0, 4000);
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
      if (!text && !photo)
        return NextResponse.json(
          { error: (e as Error).message, speechFailed: true },
          { status: 502 },
        );
    }
  }
  if (!text && !photo)
    return NextResponse.json(
      { error: "Nothing was heard — try again or type it." },
      { status: 400 },
    );

  return NextResponse.json(
    await planTurn(user, { text, actions, asking, photos, photo }),
  );
}

/** Projects, contractors, work orders and allowed actions for the panel's dropdowns. */
export async function GET() {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json(await assistantContext(user));
}
