import { NextResponse } from "next/server";
import { deviceFromRequest, deviceTurn } from "@/lib/devices";
import { appBaseUrl } from "@/lib/portal";
import { canTranscribe, transcribe } from "@/lib/voice-ai";

export const maxDuration = 60;

/**
 * One turn of conversation from the desk device. Send either the recording (audio/wav, up to ~60 s)
 * or JSON {"text": "..."}. Returns what Zuki heard, what to say, short lines for the screen,
 * Zuki's mood, and whether it's waiting for an answer.
 */
export async function POST(req: Request) {
  const d = await deviceFromRequest(req);
  if (!d) return NextResponse.json({ error: "Not paired" }, { status: 401 });
  const type = req.headers.get("content-type") ?? "";
  let text = "";
  if (type.startsWith("audio/") || type === "application/octet-stream") {
    if (!canTranscribe())
      return NextResponse.json({
        heard: "",
        say: "I can't hear voices yet — speech-to-text isn't switched on in the CRM. Ask the owner to add the voice key.",
        lines: [],
        mood: "concerned",
        expectAnswer: false,
        kind: "error",
      });
    const buf = await req.arrayBuffer();
    if (buf.byteLength < 2000)
      return NextResponse.json({
        heard: "",
        say: "I didn't hear anything — hold the button and speak.",
        lines: [],
        mood: "idle",
        expectAnswer: false,
        kind: "empty",
      });
    if (buf.byteLength > 3_000_000)
      return NextResponse.json(
        { error: "Recording too long" },
        { status: 413 },
      );
    try {
      text = await transcribe(
        new File([buf], "device.wav", {
          type: type.startsWith("audio/") ? type : "audio/wav",
        }),
        "Interior design site team: projects, contractors, payments in rupees, snags, expenses. Hindi, Hinglish or English.",
      );
    } catch (e) {
      return NextResponse.json({
        heard: "",
        say: `Sorry, I couldn't make that out. ${(e as Error).message.slice(0, 120)}`,
        lines: [],
        mood: "concerned",
        expectAnswer: false,
        kind: "error",
      });
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    text = String(body.text ?? "");
  }
  text = text.trim().slice(0, 2000);
  if (!text)
    return NextResponse.json({
      heard: "",
      say: "I didn't catch that — try again?",
      lines: [],
      mood: "idle",
      expectAnswer: false,
      kind: "empty",
    });

  try {
    const out = await deviceTurn(d, text, await appBaseUrl());
    return NextResponse.json({
      heard: text,
      say: out.say,
      lines: out.lines,
      mood: out.mood,
      expectAnswer: out.expectAnswer,
      kind: out.kind,
    });
  } catch (e) {
    console.error("device turn failed", e);
    return NextResponse.json({
      heard: text,
      say: "Something went wrong on my side — please try again.",
      lines: [],
      mood: "concerned",
      expectAnswer: false,
      kind: "error",
    });
  }
}
