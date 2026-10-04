"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  Mic,
  Send,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  INTAKE_FIELDS,
  SKIP,
  missingFields,
  type IntakeFields,
  type IntakeKind,
} from "@/lib/intake-fields";
import { saveIntake } from "./intake-actions";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
function getRec(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Turn = { from: "ai" | "me"; text: string };
type Response = {
  fields: IntakeFields;
  heard: string;
  question: string | null;
  asking: string | null;
  missing: { key: string; label: string }[];
  notice?: string;
  duplicate?: string;
  error?: string;
  speechFailed?: boolean;
};

const INTRO: Record<IntakeKind, string> = {
  lead: "Tell me about the new lead — name, phone number, city and area, type of property, budget, how they found us, and when to follow up.",
  contractor:
    "Tell me about the new contractor — name, trade, phone number, their rates, payment details, and which office they work for.",
};

export function IntakeDesk({
  kind,
  offices,
  serverSpeech,
}: {
  kind: IntakeKind;
  offices: { id: string; name: string }[];
  serverSpeech: boolean;
}) {
  const defs = INTAKE_FIELDS[kind];
  const [fields, setFields] = useState<IntakeFields>({});
  const [asking, setAsking] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([
    { from: "ai", text: INTRO[kind] },
  ]);
  const [typed, setTyped] = useState("");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [handsFree, setHandsFree] = useState(true);
  const [dictation, setDictation] = useState(false);
  const [saved, setSaved] = useState<{ href: string; name: string } | null>(
    null,
  );
  const [saving, startSaving] = useTransition();
  const rec = useRef<SpeechRec | null>(null);
  const heardRef = useRef("");
  const interimRef = useRef("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const askingRef = useRef(asking);
  askingRef.current = asking;
  const started = turns.length > 1;
  const missing = missingFields(kind, fields);
  const complete = missing.filter((m) => m.required).length === 0;

  const [ios, setIos] = useState(false);
  useEffect(() => {
    setDictation(!!getRec());
    setIos(isIOS());
    if (isIOS()) setHandsFree(false);
  }, []);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function say(text: string, then?: () => void) {
    if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis)
      return then?.();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.rate = 1;
    u.onend = () => then?.();
    u.onerror = () => then?.();
    window.speechSynthesis.speak(u);
  }

  async function send(text: string, audio?: Blob) {
    if (!text.trim() && !audio) return;
    setBusy(true);
    setError(null);
    if (text.trim()) setTurns((t) => [...t, { from: "me", text: text.trim() }]);
    try {
      const body = new FormData();
      body.append("kind", kind);
      body.append("fields", JSON.stringify(fieldsRef.current));
      if (askingRef.current) body.append("asking", askingRef.current);
      body.append("text", text);
      if (audio)
        body.append(
          "audio",
          new File(
            [audio],
            `answer.${audio.type.includes("mp4") ? "m4a" : "webm"}`,
            { type: audio.type },
          ),
        );
      // Retry once if the connection drops (weak mobile signal), with a time limit.
      let res: globalThis.Response | null = null;
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 55_000);
        try {
          res = await fetch("/api/voice/intake", {
            method: "POST",
            body,
            signal: ctrl.signal,
          });
        } catch (err) {
          if ((err as Error).name === "AbortError")
            throw new Error("This is taking too long — tap Send to try again.");
          if (attempt === 1)
            throw new Error(
              "Connection dropped — check your signal and tap Send again (your words are back in the box).",
            );
          await new Promise((r) => setTimeout(r, 1500));
        } finally {
          clearTimeout(timer);
        }
      }
      if (!res) throw new Error("Connection dropped — tap Send again.");
      const json = (await res.json().catch(() => ({
        error: `Something went wrong (${res.status})`,
      }))) as Response;
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      if (audio && json.heard)
        setTurns((t) => [...t, { from: "me", text: json.heard }]);
      setFields(json.fields);
      setAsking(json.asking);
      setNotice(json.notice ?? null);
      setDuplicate(json.duplicate ?? null);
      const reply =
        json.question ??
        "I have everything. Please check the details and tap Save.";
      setTurns((t) => [
        ...t,
        {
          from: "ai",
          text: json.duplicate ? `Note: ${json.duplicate} ${reply}` : reply,
        },
      ]);
      say(json.duplicate ? `${json.duplicate} ${reply}` : reply, () => {
        // iPhones only allow the mic after a tap, so hands-free listening is for Android/desktop.
        if (json.question && handsFree && getRec() && !isIOS()) listen(true);
      });
    } catch (e) {
      setError((e as Error).message);
      // Don't lose what was said: put it back in the text box and take it off the chat.
      if (text.trim()) {
        setTyped(text.trim());
        setTurns((t) =>
          t.length &&
          t[t.length - 1].from === "me" &&
          t[t.length - 1].text === text.trim()
            ? t.slice(0, -1)
            : t,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function listen(auto = false) {
    const Rec = getRec();
    if (!Rec) return;
    window.speechSynthesis?.cancel();
    // Make sure any previous session is fully closed — iPhone stops listening after a few tries otherwise.
    try {
      rec.current?.abort?.();
    } catch {}
    rec.current = null;
    setError(null);
    heardRef.current = "";
    const startedAt = Date.now();
    let failed = false;
    // Small pause so the phone's speaker (reading the question) releases the microphone.
    setTimeout(
      () => {
        const r = new Rec();
        r.lang = "en-IN";
        // iPhone Safari handles one-shot recognition far better than continuous.
        r.continuous = !isIOS();
        r.interimResults = true;
        r.onresult = (e) => {
          let fin = "";
          let mid = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const x = e.results[i];
            if (x.isFinal) fin += x[0].transcript;
            else mid += x[0].transcript;
          }
          if (fin) heardRef.current = `${heardRef.current} ${fin}`.trim();
          setInterim(mid);
          interimRef.current = mid;
        };
        r.onerror = (e) => {
          failed = true;
          if (e.error === "not-allowed" || e.error === "service-not-allowed")
            setError(
              auto
                ? "Tap the mic to answer (your phone only allows the microphone after a tap)."
                : "Microphone is blocked. Allow it for this site in your browser settings, or type below.",
            );
          else if (e.error === "no-speech")
            setError(
              "Didn't hear anything — tap the mic and speak, or type below.",
            );
          else if (e.error !== "aborted")
            setError(
              `Voice stopped (${e.error}). Tap the mic to try again, or type below.`,
            );
        };
        r.onend = () => {
          setListening(false);
          // Some phones end before marking the last words final — keep them.
          const heard =
            `${heardRef.current} ${heardRef.current ? "" : interimRef.current}`.trim();
          heardRef.current = "";
          interimRef.current = "";
          setInterim("");
          rec.current = null;
          if (heard) send(heard);
          else if (!failed && Date.now() - startedAt < 2500)
            setError(
              auto
                ? "Tap the mic when you're ready to answer."
                : "Didn't catch that — tap the mic and speak, or type below.",
            );
        };
        rec.current = r;
        try {
          r.start();
          setListening(true);
        } catch {
          setError(
            "Couldn't start the microphone — tap the mic again, or type below.",
          );
        }
      },
      auto ? 600 : 250,
    );
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        send(
          "",
          new Blob(chunks.current, { type: r.mimeType || "audio/webm" }),
        );
      };
      r.start(1000);
      recorder.current = r;
      setRecording(true);
    } catch {
      setError("Microphone not available — type your answer below.");
    }
  }

  function micButton() {
    if (listening) return rec.current?.stop();
    window.speechSynthesis?.cancel();
    if (recording) {
      recorder.current?.stop();
      return setRecording(false);
    }
    if (dictation) return listen();
    if (serverSpeech) return startRecording();
    setError("Voice isn't available on this browser — type below.");
  }

  function save() {
    const transcript = turns
      .filter((t) => t.from === "me")
      .map((t) => t.text)
      .join(" / ");
    startSaving(async () => {
      const res = await saveIntake(kind, fields, transcript);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved({ href: res.href, name: fields.name });
      say(`${fields.name} is saved.`);
    });
  }

  function reset() {
    window.speechSynthesis?.cancel();
    setFields({});
    setAsking(null);
    setTurns([{ from: "ai", text: INTRO[kind] }]);
    setSaved(null);
    setError(null);
    setNotice(null);
    setDuplicate(null);
  }

  if (saved) {
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-olive text-white">
          <Check />
        </div>
        <h2 className="h-display text-3xl">
          {kind === "lead" ? "Lead added" : "Contractor added"}
        </h2>
        <p className="mt-1 text-sm text-muted">{saved.name}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button onClick={reset} className="btn-brass">
            Add another
          </button>
          <Link href={saved.href} className="btn-ghost">
            Open
          </Link>
        </div>
      </div>
    );
  }

  const active = listening || recording;
  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <ul className="grid max-h-72 gap-2 overflow-y-auto text-sm">
          {turns.map((t, i) => (
            <li
              key={i}
              className={
                t.from === "ai"
                  ? "mr-8 rounded-2xl rounded-tl-sm bg-ivory px-3 py-2"
                  : "ml-8 rounded-2xl rounded-tr-sm bg-ink px-3 py-2 text-paper"
              }
            >
              {t.text}
            </li>
          ))}
          {interim && (
            <li className="ml-8 rounded-2xl bg-ink/60 px-3 py-2 text-paper">
              {interim}
            </li>
          )}
        </ul>

        <div className="mt-4 flex flex-col items-center">
          <button
            onClick={micButton}
            disabled={busy}
            className={`relative grid h-24 w-24 place-items-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-50 ${active ? "bg-clay" : "bg-brass"}`}
            aria-label={active ? "Stop" : "Speak"}
          >
            {active && (
              <span className="absolute inset-0 animate-ping rounded-full bg-clay/40" />
            )}
            {busy ? (
              <Loader2 className="animate-spin" size={36} />
            ) : active ? (
              <Square size={32} className="relative" />
            ) : (
              <Mic size={40} />
            )}
          </button>
          <p className="mt-2 text-xs text-muted">
            {busy
              ? "Filling the form…"
              : active
                ? "Listening… tap to finish"
                : started
                  ? "Tap and answer"
                  : "Tap and speak"}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = typed;
            setTyped("");
            send(t);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="…or type your answer"
            className="input"
            disabled={busy}
          />
          <button
            className="btn-primary shrink-0 px-3"
            disabled={busy || !typed.trim()}
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </form>

        {ios && (
          <p className="mt-2 text-xs text-muted">
            On iPhone: tap the mic for each answer. If the mic misbehaves, tap
            the text box and use the 🎤 on your keyboard.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <button
            type="button"
            onClick={() => setVoiceOn((v) => !v)}
            className="flex items-center gap-1"
          >
            {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}{" "}
            {voiceOn ? "Questions read aloud" : "Questions muted"}
          </button>
          {dictation && !ios && (
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={handsFree}
                onChange={(e) => setHandsFree(e.target.checked)}
                className="h-3.5 w-3.5"
              />{" "}
              Hands-free (listen after each question)
            </label>
          )}
        </div>
      </div>

      {notice && (
        <p className="rounded-xl bg-brass-soft px-4 py-2 text-xs text-brass">
          {notice}
        </p>
      )}
      {duplicate && (
        <p className="rounded-xl bg-clay-soft px-4 py-2 text-sm text-clay">
          {duplicate}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-clay-soft px-4 py-2 text-sm text-clay">
          {error}
        </p>
      )}

      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <p className="label sm:col-span-2">
          {kind === "lead" ? "New lead" : "New contractor"} —{" "}
          {defs.length - missing.length} of {defs.length} filled
        </p>
        {defs.map((d) => {
          const value = fields[d.key] ?? "";
          const empty = !value.trim();
          const set = (v: string) => setFields((f) => ({ ...f, [d.key]: v }));
          const cls = `input ${empty && started && d.required ? "border-clay" : ""} ${asking === d.key ? "ring-2 ring-brass" : ""}`;
          return (
            <div
              key={d.key}
              className={
                d.key === "notes" ||
                d.key === "rateNotes" ||
                d.key === "bankDetails"
                  ? "sm:col-span-2"
                  : ""
              }
            >
              <label className="label">
                {d.label}
                {!d.required && (
                  <span className="font-normal normal-case"> (optional)</span>
                )}
              </label>
              {d.type === "office" ? (
                <select
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className={cls}
                >
                  <option value="">—</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : d.options && d.key !== "budgetBand" ? (
                <select
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className={cls}
                >
                  <option value="">—</option>
                  {d.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : d.type === "date" ? (
                <input
                  type="date"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className={cls}
                />
              ) : d.key === "notes" || d.key === "rateNotes" ? (
                <textarea
                  value={value === SKIP ? "" : value}
                  onChange={(e) => set(e.target.value)}
                  rows={2}
                  className={cls}
                />
              ) : (
                <input
                  value={value === SKIP ? "" : value}
                  onChange={(e) => set(e.target.value)}
                  list={d.key === "budgetBand" ? "budget-bands" : undefined}
                  className={cls}
                  placeholder={!d.required && value === SKIP ? "None" : ""}
                />
              )}
            </div>
          );
        })}
        <datalist id="budget-bands">
          {(defs.find((d) => d.key === "budgetBand")?.options ?? []).map(
            (o) => (
              <option key={o} value={o} />
            ),
          )}
        </datalist>
      </div>

      <div className="sticky bottom-4 z-10 flex gap-2">
        <button onClick={reset} className="btn-ghost">
          Start over
        </button>
        <button
          onClick={save}
          disabled={!complete || saving || busy}
          className="btn-primary flex-1 py-3.5 text-base shadow-lg"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Check size={18} />
          )}
          {complete
            ? `Save ${kind}`
            : `${missing.filter((m) => m.required).length} detail${missing.filter((m) => m.required).length === 1 ? "" : "s"} still needed`}
        </button>
      </div>
    </div>
  );
}
