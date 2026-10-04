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
    let transcribeWarning: string | undefined;
    let audioUrl: string | undefined;
    if (audio instanceof File && audio.size > 0) {
      const hint = `Interior fit-out site update. Project ${ctx.project.name}, client ${ctx.project.clientName}. Stages: ${ctx.stages.map((s) => s.name).join(", ")}. May be Hindi, Hinglish, English or Arabic.`;
      const [heard, saved] = await Promise.allSettled([transcribe(audio, hint), saveFile(audio, `voice/${projectId}`)]);
      audioUrl = saved.status === "fulfilled" ? saved.value : undefined;
      if (heard.status === "fulfilled") spoken = heard.value;
      // If the voice note can't be transcribed, still go ahead with whatever was typed.
      else if (typed || earlier) transcribeWarning = `${(heard.reason as Error).message} Your typed text was used.`;
      else return NextResponse.json({ error: (heard.reason as Error).message, speechFailed: true }, { status: 502 });
    }
    const transcript = [earlier, typed, spoken].filter(Boolean).join("\n");
    if (!transcript) return NextResponse.json({ error: "Nothing was heard. Try recording again closer to the phone, or type the update." }, { status: 400 });

    let useAI = Boolean(process.env.ANTHROPIC_API_KEY);
    let aiWarning: string | undefined;
    let proposal;
    try {
      proposal = useAI ? await understand(transcript, ctx) : basicUnderstand(transcript, ctx);
    } catch (e) {
      // AI unavailable (no credit, outage): fall back to basic mode rather than blocking the site team.
      console.error("voice understand failed", e);
      useAI = false;
      const status = (e as { status?: number }).status;
      aiWarning = `AI understanding is unavailable right now${status ? ` (${status === 400 || status === 402 ? "check Anthropic credit/billing" : status === 401 ? "check ANTHROPIC_API_KEY" : status})` : ""}; basic mode was used, so please check the card carefully.`;
      proposal = basicUnderstand(transcript, ctx);
    }
    const result: UnderstandResult = {
      transcript,
      proposal,
      aiMode: useAI ? "claude" : "basic",
      notice:
        [transcribeWarning, aiWarning ?? (useAI ? undefined : "Basic mode: add ANTHROPIC_API_KEY for full understanding of payments, orders, visits and client messages.")]
          .filter(Boolean)
          .join(" ") || undefined,
      audioUrl,
      options: { stages: ctx.stages, milestones: ctx.milestones, orders: ctx.orders, visits: ctx.visits, currency: ctx.project.currency, clientName: ctx.project.clientName },
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
