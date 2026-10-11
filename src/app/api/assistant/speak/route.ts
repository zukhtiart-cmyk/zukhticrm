import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { synthesize } from "@/lib/tts";

export const maxDuration = 30;

/** Zuki's natural voice. 204 means "no cloud voice — use the phone's own voice". */
export async function POST(req: Request) {
  const session = await getSession();
  const user = session
    ? await db.query.users.findFirst({ where: eq(users.id, session.userId) })
    : null;
  if (!user || !user.active || !can(user.role, "voice"))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return new NextResponse(null, { status: 204 });
  try {
    const out = await synthesize(text);
    if (!out) return new NextResponse(null, { status: 204 });
    return new NextResponse(out.audio, {
      headers: { "content-type": out.type, "cache-control": "no-store" },
    });
  } catch (e) {
    console.error("voice failed", e);
    return new NextResponse(null, {
      status: 204,
      headers: { "x-voice-error": (e as Error).message.slice(0, 120) },
    });
  }
}
