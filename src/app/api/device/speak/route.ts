import { NextResponse } from "next/server";
import { deviceFromRequest } from "@/lib/devices";
import { synthesizeWav } from "@/lib/tts";

export const maxDuration = 30;

/** Zuki's voice for the device as a 16-bit WAV. 204 = no voice service set up; the device shows the text instead. */
export async function POST(req: Request) {
  const d = await deviceFromRequest(req);
  if (!d) return NextResponse.json({ error: "Not paired" }, { status: 401 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return new NextResponse(null, { status: 204 });
  try {
    const audio = await synthesizeWav(text);
    if (!audio) return new NextResponse(null, { status: 204 });
    return new NextResponse(audio, {
      headers: { "content-type": "audio/wav", "cache-control": "no-store" },
    });
  } catch (e) {
    console.error("device voice failed", e);
    return new NextResponse(null, {
      status: 204,
      headers: { "x-voice-error": (e as Error).message.slice(0, 120) },
    });
  }
}
