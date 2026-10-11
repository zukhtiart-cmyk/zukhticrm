import "server-only";

/**
 * Natural voice for Zuki. Uses whichever is set up in Vercel:
 * - ELEVENLABS_API_KEY (+ optional ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL) — very human, handles Hinglish well
 * - ZUKI_VOICE=openai with OPENAI_API_KEY (+ optional ZUKI_OPENAI_VOICE) — needs OpenAI credit
 * With neither, the phone's built-in voice is used.
 */
export function cloudVoiceReady() {
  return (
    !!process.env.ELEVENLABS_API_KEY ||
    (process.env.ZUKI_VOICE === "openai" && !!process.env.OPENAI_API_KEY)
  );
}

/** Text written for the screen, made easier to say out loud. */
export function forSpeech(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+—\s+/g, ", ")
    .replace(/→/g, " to ")
    .replace(/·/g, ",")
    .replace(/\n+/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 900);
}

export async function synthesize(
  text: string,
): Promise<{ audio: ArrayBuffer; type: string } | null> {
  const input = forSpeech(text);
  if (!input) return null;
  if (process.env.ELEVENLABS_API_KEY) {
    const voice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: input,
          model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!res.ok)
      throw new Error(
        `ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    return { audio: await res.arrayBuffer(), type: "audio/mpeg" };
  }
  if (process.env.ZUKI_VOICE === "openai" && process.env.OPENAI_API_KEY) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ZUKI_OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: process.env.ZUKI_OPENAI_VOICE || "coral",
        input,
        instructions:
          "Warm, friendly Indian-English voice of a helpful colleague at an interior design firm. Natural pace, relaxed, smiling. Pronounce Hindi words naturally.",
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok)
      throw new Error(
        `OpenAI voice ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    return { audio: await res.arrayBuffer(), type: "audio/mpeg" };
  }
  return null;
}
