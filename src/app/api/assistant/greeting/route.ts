import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { greetingFor } from "@/lib/assistant-greeting";
import { cloudVoiceReady } from "@/lib/tts";

/** Zuki's opening line for this person, and whether a natural cloud voice is set up. */
export async function GET() {
  const session = await getSession();
  const user = session
    ? await db.query.users.findFirst({ where: eq(users.id, session.userId) })
    : null;
  if (!user || !user.active || !can(user.role, "voice"))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({
    ...(await greetingFor(user)),
    cloudVoice: cloudVoiceReady(),
  });
}
