"use client";

/**
 * Text-to-speech helpers that work on iPhone:
 * - Safari only speaks after speech has been "unlocked" inside a tap, so primeSpeech() runs on the first tap.
 * - After the microphone is used, iOS keeps audio on the quiet earpiece; switching the audio session
 *   back to "playback" sends it to the loudspeaker (Safari 16.4+).
 * - cancel() followed immediately by speak() is silently dropped on iOS, so speaking waits a moment.
 */
type AudioSessionNav = Navigator & { audioSession?: { type: string } };
let primed = false;

export function setAudioMode(mode: "playback" | "play-and-record") {
  try {
    const s = (navigator as AudioSessionNav).audioSession;
    if (s) s.type = mode;
  } catch {}
}

export function primeSpeech() {
  if (primed || typeof window === "undefined" || !window.speechSynthesis)
    return;
  primed = true;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.getVoices();
  } catch {}
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang?.startsWith("en-IN")) ??
    voices.find(
      (v) =>
        v.lang === "en-GB" &&
        /female|samantha|karen|serena|moira/i.test(v.name),
    ) ??
    voices.find((v) => v.lang?.startsWith("en")) ??
    null
  );
}

export function speak(
  text: string,
  on: { start?: () => void; end?: () => void } = {},
) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    on.end?.();
    return;
  }
  const synth = window.speechSynthesis;
  setAudioMode("playback");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    on.end?.();
  };
  const go = () => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-IN";
    u.rate = 1;
    u.volume = 1;
    u.onstart = () => on.start?.();
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
    // Safety net: some phones never fire onend.
    setTimeout(
      () => {
        if (!synth.speaking && !synth.pending) finish();
      },
      1500 + text.length * 90,
    );
    // iOS sometimes gets stuck paused.
    if (synth.paused) synth.resume();
  };
  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(go, 150);
  } else go();
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}
