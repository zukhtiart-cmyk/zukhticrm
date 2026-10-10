"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  Loader2,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Zuki, ZukiFace, type ZukiState } from "@/components/zuki";
import {
  primeSpeech,
  setAudioMode,
  speak,
  stopSpeaking,
} from "@/lib/speech-client";
import {
  ACTION_LABEL,
  EXPENSE_CATEGORIES,
  HANDOFF,
  PAYMENT_MODES,
  handoffHref,
  type AssistantAction,
  type AssistantContext,
  type AssistantReply,
  type Missing,
} from "@/lib/assistant-types";

// Minimal typings for the browser's speech recognition.
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
const getRec = (): (new () => SpeechRec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const GREETING =
  "Hi! Tell me anything — a site update, a payment, an expense, a snag, a new lead — or ask me a question like “What's Ramesh's balance?”. You can also send me a photo of a bill or a problem.";
const KIND_LABEL: Record<string, string> = {
  ADVANCE: "Advance",
  WAGES: "Wages",
  OTHER: "Other",
  BILL: "Pays approved bill",
};

/** Same rules as the server, so edits on the cards update what's still needed. */
function clientMissing(
  actions: AssistantAction[],
  photos: Record<number, File | undefined>,
): Missing[] {
  const out: Missing[] = [];
  actions.forEach((a, i) => {
    const need: [string, string][] =
      a.type === "payment"
        ? [
            ["contractorId", "Contractor"],
            ["projectId", "Project"],
            ["amount", "Amount"],
            ["mode", "Paid by"],
          ]
        : a.type === "expense"
          ? [
              ["projectId", "Project"],
              ["amount", "Amount"],
              ["description", "Details"],
            ]
          : a.type === "snag"
            ? [
                ["projectId", "Project"],
                ["description", "Details"],
              ]
            : a.type === "project_update" || a.type === "measurements"
              ? [["projectId", "Project"]]
              : a.type === "bill"
                ? [
                    ["contractorId", "Contractor"],
                    ["projectId", "Project"],
                    ["amount", "Amount"],
                    ["workOrderId", "Work order"],
                  ]
                : [];
    for (const [f, label] of need) {
      const v = (a as Record<string, unknown>)[f];
      if (v === null || v === undefined || v === "")
        out.push({ index: i, field: f, label, question: "" });
    }
    if (a.type === "snag" && !photos[i] && !a.photoSkipped)
      out.push({
        index: i,
        field: "photo",
        label: "Photo",
        question: "",
        optional: true,
      });
  });
  return out;
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<AssistantContext | null>(null);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [photos, setPhotos] = useState<Record<number, File | undefined>>({});
  const [asking, setAsking] = useState<AssistantReply["asking"]>(null);
  const [bubble, setBubble] = useState(GREETING);
  const [heard, setHeard] = useState("");
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<
    { index: number; ok: boolean; message: string; href?: string }[] | null
  >(null);
  const rec = useRef<SpeechRec | null>(null);
  const heardRef = useRef("");
  const interimRef = useRef("");
  const stateRef = useRef({ actions, asking, photos });
  stateRef.current = { actions, asking, photos };

  useEffect(() => {
    fetch("/api/assistant/understand")
      .then((r) => r.json())
      .then((c) => !c.error && setCtx(c))
      .catch(() => {});
    return () => stopSpeaking();
  }, []);

  function say(text: string) {
    if (!voiceOn) return;
    setSpeaking(true);
    speak(text, {
      start: () => setSpeaking(true),
      end: () => setSpeaking(false),
    });
  }

  async function send(text: string, photo?: File) {
    if (!text.trim() && !photo) return;
    setBusy(true);
    setError(null);
    setResults(null);
    setHeard(photo ? `📷 ${text.trim() || "Reading the photo…"}` : text.trim());
    const s = stateRef.current;
    try {
      const body = new FormData();
      body.set("text", text.trim());
      if (photo) body.set("photo", photo);
      body.set("actions", JSON.stringify(s.actions));
      body.set("asking", JSON.stringify(s.asking));
      body.set(
        "photos",
        Object.keys(s.photos)
          .filter((k) => s.photos[Number(k)])
          .join(","),
      );
      let res: Response | null = null;
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try {
          res = await fetch("/api/assistant/understand", {
            method: "POST",
            body,
          });
        } catch {
          if (attempt === 1)
            throw new Error(
              "Connection dropped — check your signal and try again.",
            );
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      const json = (await res!.json().catch(() => ({
        error: `Something went wrong (${res!.status})`,
      }))) as AssistantReply & {
        error?: string;
        context?: AssistantContext;
        attachPhotoTo?: number;
      };
      if (!res!.ok) throw new Error(json.error || "Something went wrong");
      if (json.context) setCtx(json.context);
      // Photos belong to positions; drop any whose action disappeared.
      setPhotos((p) =>
        Object.fromEntries(
          Object.entries(p).filter(([k]) => Number(k) < json.actions.length),
        ),
      );
      if (
        photo &&
        json.attachPhotoTo !== undefined &&
        json.attachPhotoTo !== null
      )
        setPhotos((p) => ({ ...p, [json.attachPhotoTo!]: photo }));
      setActions(json.actions);
      setAsking(json.asking);
      setNotice(json.notice ?? null);
      setBubble(json.reply);
      say(json.reply);
    } catch (e) {
      setError((e as Error).message);
      if (text.trim()) setTyped(text.trim());
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    const Rec = getRec();
    if (!Rec) {
      setError(
        "Voice isn't available in this browser — type below, or use the 🎤 on your keyboard.",
      );
      return;
    }
    stopSpeaking();
    try {
      rec.current?.abort?.();
    } catch {}
    setError(null);
    heardRef.current = "";
    interimRef.current = "";
    setTimeout(() => {
      const r = new Rec();
      r.lang = "en-IN";
      r.continuous = !isIOS();
      r.interimResults = true;
      r.onresult = (e) => {
        let fin = "";
        let mid = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) fin += e.results[i][0].transcript;
          else mid += e.results[i][0].transcript;
        }
        if (fin) heardRef.current = `${heardRef.current} ${fin}`.trim();
        interimRef.current = mid;
        setInterim(mid);
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed")
          setError(
            "Microphone is blocked. On iPhone: tap “aA” in the address bar → Website Settings → Microphone → Allow. Or type below.",
          );
        else if (e.error === "no-speech")
          setError("Didn't hear anything — tap Zuki and speak.");
      };
      r.onend = () => {
        setListening(false);
        const text =
          `${heardRef.current} ${heardRef.current ? "" : interimRef.current}`.trim();
        setInterim("");
        rec.current = null;
        if (text) send(text);
      };
      rec.current = r;
      try {
        setAudioMode("play-and-record");
        r.start();
        setListening(true);
      } catch {
        setError(
          "Couldn't start the microphone — tap Zuki again, or type below.",
        );
      }
    }, 200);
  }

  function tapZuki() {
    primeSpeech();
    if (listening) return rec.current?.stop();
    listen();
  }

  const patch = (i: number, p: Partial<AssistantAction>) =>
    setActions((all) => all.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const remove = (i: number) => {
    setActions((all) => all.filter((_, j) => j !== i));
    setPhotos((p) => {
      const next: Record<number, File | undefined> = {};
      Object.entries(p).forEach(([k, f]) => {
        const n = Number(k);
        if (n < i) next[n] = f;
        else if (n > i) next[n - 1] = f;
      });
      return next;
    });
    setAsking(null);
  };

  const missing = clientMissing(actions, photos);
  const blocking = missing.filter((m) => !m.optional);
  const savable = actions
    .map((a, i) => ({ a, i }))
    .filter((x) => !HANDOFF.includes(x.a.type));
  const handoffs = actions
    .map((a, i) => ({ a, i }))
    .filter((x) => HANDOFF.includes(x.a.type));

  async function save() {
    primeSpeech();
    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("actions", JSON.stringify(actions));
      Object.entries(photos).forEach(
        ([k, f]) => f && body.set(`photo_${k}`, f),
      );
      const res = await fetch("/api/assistant/execute", {
        method: "POST",
        body,
      });
      const json = await res
        .json()
        .catch(() => ({ error: `Something went wrong (${res.status})` }));
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      setResults(json.results);
      const ok = (json.results as { ok: boolean }[]).filter((r) => r.ok).length;
      const failed = json.results.length - ok;
      const msg = failed
        ? `Saved ${ok}, but ${failed} couldn't be saved — see below.`
        : `Done! ${ok === 1 ? "It's" : `All ${ok} are`} saved in the right place.`;
      setBubble(
        handoffs.length ? `${msg} Tap “Open” to finish the rest.` : msg,
      );
      say(msg);
      if (!failed) {
        // Keep only hand-offs (if any) so they can still be opened.
        setActions((all) => all.filter((a) => HANDOFF.includes(a.type)));
        setPhotos({});
        setAsking(null);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    stopSpeaking();
    setActions([]);
    setPhotos({});
    setAsking(null);
    setResults(null);
    setError(null);
    setNotice(null);
    setHeard("");
    setBubble(GREETING);
  }

  const state: ZukiState =
    busy || saving
      ? "thinking"
      : listening
        ? "listening"
        : speaking
          ? "speaking"
          : "idle";
  const projectName = (id?: string | null) =>
    ctx?.projects.find((p) => p.id === id)?.name;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full flex-col bg-ivory shadow-2xl sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Zuki assistant"
      >
        <div className="flex items-center justify-between border-b border-line bg-paper px-4 py-3">
          <div className="flex items-center gap-2">
            <ZukiFace size={28} />
            <div>
              <p className="font-semibold leading-tight">Zuki</p>
              <p className="text-[11px] text-muted">
                Say it once — I&apos;ll file it in the right place
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setVoiceOn((v) => !v)}
              className="rounded-lg p-2 text-muted"
              aria-label={voiceOn ? "Mute Zuki" : "Unmute Zuki"}
            >
              {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              onClick={reset}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-muted"
            >
              Start over
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <Zuki
            size={132}
            state={state}
            bubble={bubble}
            userText={listening ? interim || "…" : busy ? heard : undefined}
            hint={
              busy
                ? "Working it out…"
                : saving
                  ? "Saving…"
                  : listening
                    ? "Tap Zuki when you're done"
                    : "Tap Zuki and speak"
            }
            onTap={tapZuki}
            disabled={busy || saving}
          />

          {notice && (
            <p className="mt-3 rounded-xl bg-brass-soft px-3 py-2 text-xs text-brass">
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-xl bg-clay-soft px-3 py-2 text-sm text-clay">
              {error}
            </p>
          )}

          <div className="mt-4 grid gap-3">
            {actions.map((a, i) => {
              const miss = (f: string) =>
                missing.some((m) => m.index === i && m.field === f);
              const focus = (f: string) =>
                asking?.index === i && asking.field === f
                  ? "ring-2 ring-brass"
                  : miss(f) && f !== "photo"
                    ? "border-clay"
                    : "";
              const result = results?.find((r) => r.index === i);
              return (
                <div key={i} className="card p-3 text-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-brass">
                      {ACTION_LABEL[a.type]}
                    </p>
                    <button
                      onClick={() => remove(i)}
                      className="text-muted hover:text-clay"
                      aria-label="Remove"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {(a.type === "payment" ||
                    a.type === "expense" ||
                    a.type === "snag" ||
                    a.type === "project_update" ||
                    a.type === "bill" ||
                    a.type === "measurements") && (
                    <select
                      value={a.projectId ?? ""}
                      onChange={(e) =>
                        patch(i, { projectId: e.target.value || null })
                      }
                      className={`input mb-2 py-1.5 ${focus("projectId")}`}
                      aria-label="Project"
                    >
                      <option value="">Project…</option>
                      {ctx?.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {a.type === "payment" && (
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={a.contractorId ?? ""}
                        onChange={(e) =>
                          patch(i, {
                            contractorId: e.target.value || null,
                            billId: null,
                            billLabel: null,
                          })
                        }
                        className={`input col-span-2 py-1.5 ${focus("contractorId")}`}
                        aria-label="Contractor"
                      >
                        <option value="">
                          {a.contractorName
                            ? `“${a.contractorName}” — choose…`
                            : "Contractor / labour…"}
                        </option>
                        {ctx?.contractors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.trade})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={a.amount ?? ""}
                        onChange={(e) =>
                          patch(i, {
                            amount: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        placeholder="Amount"
                        className={`input py-1.5 ${focus("amount")}`}
                        aria-label="Amount"
                      />
                      <select
                        value={a.mode ?? ""}
                        onChange={(e) =>
                          patch(i, { mode: e.target.value || null })
                        }
                        className={`input py-1.5 ${focus("mode")}`}
                        aria-label="Paid by"
                      >
                        <option value="">Paid by…</option>
                        {PAYMENT_MODES.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                      {a.kind === "BILL" ? (
                        <p className="col-span-2 text-xs text-olive">
                          Pays approved bill {a.billLabel}
                        </p>
                      ) : (
                        <select
                          value={a.kind ?? "ADVANCE"}
                          onChange={(e) =>
                            patch(i, {
                              kind: e.target.value as AssistantAction["kind"],
                            })
                          }
                          className="input py-1.5"
                          aria-label="Type"
                        >
                          {["ADVANCE", "WAGES", "OTHER"].map((k) => (
                            <option key={k} value={k}>
                              {KIND_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        value={a.reference ?? ""}
                        onChange={(e) =>
                          patch(i, { reference: e.target.value || null })
                        }
                        placeholder="UTR / ref (optional)"
                        className="input py-1.5"
                        aria-label="Reference"
                      />
                    </div>
                  )}

                  {a.type === "expense" && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={a.amount ?? ""}
                        onChange={(e) =>
                          patch(i, {
                            amount: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        placeholder="Amount"
                        className={`input py-1.5 ${focus("amount")}`}
                        aria-label="Amount"
                      />
                      <select
                        value={a.category ?? "Material"}
                        onChange={(e) => patch(i, { category: e.target.value })}
                        className="input py-1.5"
                        aria-label="Category"
                      >
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        value={a.description ?? ""}
                        onChange={(e) =>
                          patch(i, { description: e.target.value || null })
                        }
                        placeholder="What for"
                        className={`input col-span-2 py-1.5 ${focus("description")}`}
                        aria-label="What for"
                      />
                    </div>
                  )}

                  {a.type === "snag" && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={a.room ?? ""}
                        onChange={(e) =>
                          patch(i, { room: e.target.value || null })
                        }
                        placeholder="Room"
                        className="input py-1.5"
                        aria-label="Room"
                      />
                      <select
                        value={a.contractorId ?? ""}
                        onChange={(e) =>
                          patch(i, { contractorId: e.target.value || null })
                        }
                        className="input py-1.5"
                        aria-label="Assign to"
                      >
                        <option value="">Assign to…</option>
                        {ctx?.contractors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={a.description ?? ""}
                        onChange={(e) =>
                          patch(i, { description: e.target.value || null })
                        }
                        rows={2}
                        placeholder="What needs fixing"
                        className={`input col-span-2 py-1.5 ${focus("description")}`}
                        aria-label="What needs fixing"
                      />
                    </div>
                  )}

                  {(a.type === "snag" ||
                    a.type === "payment" ||
                    a.type === "expense" ||
                    a.type === "bill") && (
                    <div className="mt-2 flex items-center gap-2">
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs font-semibold ${a.type === "snag" && miss("photo") ? "border-brass text-brass" : "border-line text-muted"} ${focus("photo")}`}
                      >
                        <Camera size={16} />
                        {photos[i]
                          ? "Change photo"
                          : a.type === "snag"
                            ? "Add snag photo"
                            : a.type === "payment"
                              ? "Add receipt (optional)"
                              : "Add bill photo (optional)"}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setPhotos((p) => ({ ...p, [i]: f }));
                              if (
                                asking?.index === i &&
                                asking.field === "photo"
                              ) {
                                setAsking(null);
                                setBubble(
                                  "Thanks — got the photo. Check the card and tap Confirm.",
                                );
                              }
                            }
                          }}
                        />
                      </label>
                      {photos[i] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={URL.createObjectURL(photos[i]!)}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      )}
                      {a.type === "snag" && !photos[i] && !a.photoSkipped && (
                        <button
                          type="button"
                          onClick={() => patch(i, { photoSkipped: true })}
                          className="text-xs text-muted underline"
                        >
                          No photo
                        </button>
                      )}
                    </div>
                  )}

                  {(a.type === "project_update" ||
                    a.type === "new_lead" ||
                    a.type === "new_contractor") && (
                    <>
                      <p className="rounded-lg bg-ivory px-2 py-1.5 text-xs">
                        “{a.text}”
                      </p>
                      <button
                        type="button"
                        disabled={a.type === "project_update" && !a.projectId}
                        onClick={() => {
                          onClose();
                          router.push(handoffHref(a));
                        }}
                        className="btn-brass mt-2 w-full py-2 text-xs"
                      >
                        {a.type === "project_update"
                          ? `Open update for ${projectName(a.projectId) ?? "project"} →`
                          : a.type === "new_lead"
                            ? "Open new lead form →"
                            : "Open new contractor form →"}
                      </button>
                      <p className="mt-1 text-[11px] text-muted">
                        {a.type === "project_update"
                          ? "Stages, client payments, orders and visits are checked on the update screen before saving."
                          : "I'll fill the form with what you said and ask for anything missing."}
                      </p>
                    </>
                  )}

                  {a.type === "bill" && (
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={a.contractorId ?? ""}
                        onChange={(e) =>
                          patch(i, {
                            contractorId: e.target.value || null,
                            workOrderId: null,
                          })
                        }
                        className={`input col-span-2 py-1.5 ${focus("contractorId")}`}
                        aria-label="Contractor"
                      >
                        <option value="">
                          {a.contractorName
                            ? `“${a.contractorName}” — choose…`
                            : "Contractor…"}
                        </option>
                        {ctx?.contractors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.trade})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={a.amount ?? ""}
                        onChange={(e) =>
                          patch(i, {
                            amount: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        placeholder="Bill amount"
                        className={`input py-1.5 ${focus("amount")}`}
                        aria-label="Bill amount"
                      />
                      <select
                        value={a.workOrderId ?? ""}
                        onChange={(e) =>
                          patch(i, { workOrderId: e.target.value || null })
                        }
                        className={`input py-1.5 ${focus("workOrderId")}`}
                        aria-label="Work order"
                      >
                        <option value="">Work order…</option>
                        {ctx?.workOrders
                          .filter(
                            (w) =>
                              w.contractorId === a.contractorId &&
                              w.projectId === a.projectId,
                          )
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.number} · {w.title}
                            </option>
                          ))}
                      </select>
                      <input
                        value={a.note ?? ""}
                        onChange={(e) =>
                          patch(i, { note: e.target.value || null })
                        }
                        placeholder="Work covered"
                        className="input col-span-2 py-1.5"
                        aria-label="Work covered"
                      />
                    </div>
                  )}

                  {a.type === "measurements" && (
                    <>
                      <p className="whitespace-pre-line rounded-lg bg-ivory px-2 py-1.5 text-xs">
                        {a.text}
                      </p>
                      <button
                        type="button"
                        disabled={!a.projectId}
                        onClick={() => {
                          onClose();
                          router.push(handoffHref(a));
                        }}
                        className="btn-brass mt-2 w-full py-2 text-xs"
                      >
                        Draft BOQ for {projectName(a.projectId) ?? "project"} →
                      </button>
                    </>
                  )}

                  {a.type === "open" && a.href && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        router.push(a.href!);
                      }}
                      className="btn-ghost w-full py-2 text-xs"
                    >
                      Open →
                    </button>
                  )}

                  {result && (
                    <p
                      className={`mt-2 rounded-lg px-2 py-1.5 text-xs ${result.ok ? "bg-olive-soft text-olive" : "bg-clay-soft text-clay"}`}
                    >
                      {result.ok ? "✓ " : "✗ "}
                      {result.message}{" "}
                      {result.ok && result.href && (
                        <button
                          type="button"
                          className="font-semibold underline"
                          onClick={() => {
                            onClose();
                            router.push(result.href!);
                          }}
                        >
                          View
                        </button>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
            {results
              ?.filter((r) => r.ok && !actions[r.index])
              .map((r) => (
                <p
                  key={r.index}
                  className="rounded-lg bg-olive-soft px-3 py-2 text-xs text-olive"
                >
                  ✓ {r.message}{" "}
                  {r.href && (
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => {
                        onClose();
                        router.push(r.href!);
                      }}
                    >
                      View
                    </button>
                  )}
                </p>
              ))}
          </div>
        </div>

        <div className="border-t border-line bg-paper px-4 py-3">
          {savable.length > 0 && (
            <button
              onClick={save}
              disabled={saving || busy || blocking.length > 0}
              className="btn-primary mb-2 w-full py-3 text-base"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Check size={18} />
              )}
              {blocking.length
                ? `${blocking.length} detail${blocking.length > 1 ? "s" : ""} still needed`
                : `Confirm & save${savable.length > 1 ? ` all ${savable.length}` : ""}`}
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              primeSpeech();
              const t = typed;
              setTyped("");
              send(t);
            }}
            className="flex gap-2"
          >
            <label
              className={`grid w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-line bg-paper text-brass ${busy ? "pointer-events-none opacity-50" : ""}`}
              title="Snap a bill, contractor bill, measurement sheet or a problem on site"
              aria-label="Send a photo to Zuki"
            >
              <Camera size={18} />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) {
                    primeSpeech();
                    const t = typed;
                    setTyped("");
                    send(t, f);
                  }
                }}
              />
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="…or type it here"
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
        </div>
      </div>
    </div>
  );
}
