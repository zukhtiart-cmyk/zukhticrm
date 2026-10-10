import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { executeActions } from "@/lib/assistant-core";
import type { AssistantAction } from "@/lib/assistant-types";

export const maxDuration = 60;

/** Saves the confirmed assistant actions using the same checks as the screens they belong to. */
export async function POST(req: Request) {
  const session = await getSession();
  const user = session
    ? await db.query.users.findFirst({ where: eq(users.id, session.userId) })
    : null;
  if (!user || !user.active || !can(user.role, "voice"))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const form = await req.formData();
  let raw: AssistantAction[] = [];
  try {
    raw = JSON.parse(String(form.get("actions") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const photoAt = (i: number) => {
    const f = form.get(`photo_${i}`);
    return f instanceof File && f.size > 0 ? f : null;
  };
  const out = await executeActions(
    user,
    Array.isArray(raw) ? raw : [],
    photoAt,
  );
  if (out.error)
    return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({ results: out.results });
}
