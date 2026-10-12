import { NextResponse } from "next/server";
import { deviceFromRequest } from "@/lib/devices";
import { greetingFor } from "@/lib/assistant-greeting";
import { cloudVoiceReady } from "@/lib/tts";
import { canTranscribe } from "@/lib/voice-ai";

/** What Zuki says when the device wakes up, and what this device can do right now. */
export async function GET(req: Request) {
  const d = await deviceFromRequest(req);
  if (!d) return NextResponse.json({ error: "Not paired" }, { status: 401 });
  const g = await greetingFor(d.user);
  return NextResponse.json({
    say: g.text,
    lines: g.nudges,
    mood: "idle",
    user: d.user.name,
    device: d.device.name,
    canListen: canTranscribe(),
    canSpeak: cloudVoiceReady(),
  });
}
