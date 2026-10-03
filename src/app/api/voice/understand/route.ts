import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { can } from "@/lib/permissions";
import { basicUnderstand, transcribe, understand } from "@/lib/voice-ai";
import { buildVoiceContext } from "@/lib/voice-context";
import { saveFile } from "@/lib/storage";
import type { UnderstandResult } from "@/lib/voice-types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession();
  const user = session ? await db.query.users.findFirst({ where: eq(users.id, session.userId), with: { office: true } }) : null;
  if (!user || !user.active || !can(user.role, "voice")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData();
  const projectId = String(form.get("projectId") ?? "");
  const typed = String(form.get("text") ?? "").trim();
  const earlier = String(form.get("earlier") ?? "").trim();
  const audio = form.get("audio");

  const built = await buildVoiceContext(projectId, user);
  if (!built) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const { ctx } = built;

  try {
    let spoken = "";
    let audioUrl: string | undefined;
    if (audio instanceof File && audio.size > 0) {
      const hint = `Interior fit-out site update. Project ${ctx.project.name}, client ${ctx.project.clientName}. Stages: ${ctx.stages.map((s) => s.name).join(", ")}. May be Hindi, Hinglish, English or Arabic.`;
      [spoken, audioUrl] = await Promise.all([transcribe(audio, hint), saveFile(audio, `voice/${projectId}`).catch(() => undefined)]);
    }
    const transcript = [earlier, typed, spoken].filter(Boolean).join("\n");
    if (!transcript) return NextResponse.json({ error: "Nothing was heard. Try recording again closer to the phone, or type the update." }, { status: 400 });

    const useAI = Boolean(process.env.ANTHROPIC_API_KEY);
    const proposal = useAI ? await understand(transcript, ctx) : basicUnderstand(transcript, ctx);
    const result: UnderstandResult = {
      transcript,
      proposal,
      aiMode: useAI ? "claude" : "basic",
      notice: useAI ? undefined : "Basic mode: add ANTHROPIC_API_KEY for full understanding of payments, orders, visits and client messages.",
      audioUrl,
      options: { stages: ctx.stages, milestones: ctx.milestones, orders: ctx.orders, visits: ctx.visits, currency: ctx.project.currency, clientName: ctx.project.clientName },
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
