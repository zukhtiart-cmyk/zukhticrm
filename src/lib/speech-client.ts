"use client";

/**
 * Zuki's voice on phones and computers.
 * - A natural cloud voice (/api/assistant/speak) when one is set up, otherwise the device's best built-in voice.
 * - Safari only plays sound after it has been "unlocked" inside a tap, so primeSpeech() runs on the first tap
 *   and unlocks both the built-in voice and the audio player that plays the cloud voice.
 * - After the microphone is used, iOS keeps audio on the quiet earpiece; switching the audio session
 *   back to "playback" sends it to the loudspeaker (Safari 16.4+).
 * - cancel() followed immediately by speak() is silently dropped on iOS, so speaking waits a moment.
 */
type AudioSessionNav = Navigator & { audioSession?: { type: string } };
let primed = false;
let cloudVoice = false;
let player: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
/** Each speak() gets a number; stopSpeaking() moves it on so late audio from an older reply is ignored. */
let turn = 0;

export function setAudioMode(mode: "playback" | "play-and-record") {
  try {
    const s = (navigator as AudioSessionNav).audioSession;
    if (s) s.type = mode;
  } catch {}
}

export function setCloudVoice(on: boolean) {
  cloudVoice = on;
}

/** A tenth of a second of silence, used to unlock the audio player inside a tap. */
function silentWav() {
  const rate = 8000;
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export function primeSpeech() {
  if (typeof window === "undefined") return;
  if (!player) {
    try {
      player = new Audio();
      player.setAttribute("playsinline", "");
      player.src = silentWav();
      player.play().catch(() => {});
    } catch {}
  }
  if (primed || !window.speechSynthesis) return;
  primed = true;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.getVoices();
  } catch {}
}

const NATURAL = /natural|neural|enhanced|premium|google|siri|online/i;
function pickVoice(text: string) {
  const voices = window.speechSynthesis.getVoices();
  if (/[ऀ-ॿ]/.test(text)) {
    const hi = voices.filter((v) => v.lang?.toLowerCase().startsWith("hi"));
    return hi.find((v) => NATURAL.test(v.name)) ?? hi[0] ?? null;
  }
  const inEn = voices.filter((v) =>
    v.lang?.replace("_", "-").startsWith("en-IN"),
  );
  const anyEn = voices.filter((v) => v.lang?.startsWith("en"));
  return (
    inEn.find((v) => NATURAL.test(v.name)) ??
    inEn[0] ??
    anyEn.find((v) => NATURAL.test(v.name) && /GB|AU/.test(v.lang)) ??
    anyEn.find((v) => NATURAL.test(v.name)) ??
    anyEn.find((v) => /samantha|karen|serena|moira|daniel/i.test(v.name)) ??
    anyEn[0] ??
    null
  );
}

/** Screen text made easier to say: no links, emoji or symbols. */
function forSpeech(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+—\s+/g, ", ")
    .replace(/→/g, " to ")
    .replace(/·/g, ",")
    .replace(/\n+/g, ". ")
    .trim();
}

function browserSpeak(
  text: string,
  my: number,
  on: { start?: () => void; end?: () => void },
) {
  if (!window.speechSynthesis) return on.end?.();
  const synth = window.speechSynthesis;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (my === turn) on.end?.();
  };
  const go = () => {
    if (my !== turn) return finish();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-IN";
    u.rate = 1.03;
    u.pitch = 1.05;
    u.volume = 1;
    u.onstart = () => on.start?.();
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
    // Safety net: some phones never fire onend.
    const check = () => {
      if (done) return;
      if (!synth.speaking && !synth.pending) finish();
      else setTimeout(check, 700);
    };
    setTimeout(check, 1500 + text.length * 70);
    if (synth.paused) synth.resume();
  };
  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(go, 150);
  } else go();
}

export function speak(
  raw: string,
  on: { start?: () => void; end?: () => void } = {},
) {
  if (typeof window === "undefined") return on.end?.();
  const text = forSpeech(raw);
  stopSpeaking();
  const my = ++turn;
  if (!text) return on.end?.();
  setAudioMode("playback");
  if (!cloudVoice || !player) return browserSpeak(text, my, on);

  // Natural cloud voice, falling back to the device voice if it isn't available right now.
  fetch("/api/assistant/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  })
    .then(async (res) => {
      if (my !== turn) return;
      if (res.status !== 200) return browserSpeak(text, my, on);
      const blob = await res.blob();
      if (my !== turn || !player) return;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = URL.createObjectURL(blob);
      const p = player;
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        if (my === turn) on.end?.();
      };
      p.onended = end;
      p.onerror = end;
      p.onpause = () => {
        if (p.currentTime > 0 && p.currentTime < (p.duration || 0) - 0.05)
          end();
      };
      p.src = currentUrl;
      on.start?.();
      await p.play().catch(() => {
        ended = true;
        browserSpeak(text, my, on);
      });
    })
    .catch(() => my === turn && browserSpeak(text, my, on));
}

export function stopSpeaking() {
  turn++;
  try {
    window.speechSynthesis?.cancel();
  } catch {}
  try {
    if (player && !player.paused) player.pause();
  } catch {}
}
