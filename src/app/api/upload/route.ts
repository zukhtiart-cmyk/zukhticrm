import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveFile } from "@/lib/storage";
import { buildVoiceContext } from "@/lib/voice-context";

const MAX = 15 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  const user = session ? await db.query.users.findFirst({ where: eq(users.id, session.userId), with: { office: true } }) : null;
  if (!user || !user.active || !can(user.role, "voice")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData();
  const projectId = String(form.get("projectId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) return NextResponse.json({ error: "Only images can be uploaded here" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Photo is too large (max 15 MB)" }, { status: 400 });
  if (!(await buildVoiceContext(projectId, user))) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const url = await saveFile(file, `photos/${projectId}`);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
