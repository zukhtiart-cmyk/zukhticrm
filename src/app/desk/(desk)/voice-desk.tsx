"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Camera,
  Check,
  CloudOff,
  ImagePlus,
  Loader2,
  MapPin,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { UnderstandResult, VoiceProposal } from "@/lib/voice-types";
import { confirmVoiceUpdate, setSiteLocation } from "./actions";
import { Zuki } from "@/components/zuki";
import {
  distanceM,
  isNetworkError,
  queue,
  type QueuedUpdate,
} from "./offline-queue";

type ProjectOption = {
  id: string;
  name: string;
  client: string;
  code: string;
  lat: number | null;
  lng: number | null;
};
type Perms = {
  stages: boolean;
  payments: boolean;
  orders: boolean;
  visits: boolean;
  design: boolean;
};
type Photo = {
  key: string;
  preview: string;
  url?: string;
  error?: string;
  clientVisible: boolean;
  blob?: Blob;
  offline?: boolean;
};
const NEAR_M = 1000;
export type ProjectSnapshot = {
  progress: number;
  currentStage: string;
  stages: { name: string; status: string; progress: number }[];
  orders: { item: string; status: string; eta: string | null }[];
  milestones: {
    label: string;
    amount: number;
    status: string;
    currency: string;
  }[];
};

const ORDER_LABEL: Record<string, string> = {
  ORDERED: "Ordered",
  IN_PRODUCTION: "In production",
  SHIPPED: "Shipped",
  CUSTOMS: "At customs",
  DELIVERED: "Delivered",
};
const shortDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "";

function Snapshot({ s }: { s: ProjectSnapshot }) {
  return (
    <details className="mt-3 rounded-xl bg-ivory px-3 py-2 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-muted">
        Now: {s.currentStage} · overall {s.progress}%
      </summary>
      <div className="mt-2 grid gap-2">
        {s.stages.length > 0 && (
          <ul className="grid gap-1">
            {s.stages.map((st) => (
              <li key={st.name} className="flex justify-between gap-2 text-xs">
                <span
                  className={st.status === "NOT_STARTED" ? "text-muted" : ""}
                >
                  {st.name}
                </span>
                <span
                  className={st.status === "DONE" ? "text-olive" : "text-muted"}
                >
                  {st.status === "DONE"
                    ? "Done"
                    : st.status === "IN_PROGRESS"
                      ? `${st.progress}%`
                      : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {s.orders.length > 0 && (
          <ul className="grid gap-1">
            {s.orders.map((o) => (
              <li key={o.item} className="flex justify-between gap-2 text-xs">
                <span>{o.item}</span>
                <span className="text-muted">
                  {ORDER_LABEL[o.status] ?? o.status}
                  {o.eta && o.status !== "DELIVERED"
                    ? ` · ETA ${shortDate(o.eta)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {s.milestones.length > 0 && (
          <ul className="grid gap-1">
            {s.milestones.map((m) => (
              <li key={m.label} className="flex justify-between gap-2 text-xs">
                <span>{m.label}</span>
                <span
                  className={m.status === "PAID" ? "text-olive" : "text-muted"}
                >
                  {m.currency} {Math.round(m.amount).toLocaleString("en-IN")} ·{" "}
                  {m.status === "PAID"
                    ? "paid"
                    : m.status === "INVOICED"
                      ? "invoiced"
                      : "due later"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

const STAGE_STATUSES = [
  ["NOT_STARTED", "Not started"],
  ["IN_PROGRESS", "In progress"],
  ["DONE", "Done"],
] as const;
const ORDER_STATUSES = [
  ["ORDERED", "Ordered"],
  ["IN_PRODUCTION", "In production"],
  ["SHIPPED", "Shipped"],
  ["CUSTOMS", "At customs"],
  ["DELIVERED", "Delivered"],
] as const;

/** Phone photos are large; shrink to 1600px JPEG before upload for weak site signal. */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) =>
      canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.8),
    );
  } catch {
    return file;
  }
}

// Minimal typings for the browser's speech recognition (Chrome, Safari).
type SpeechRecResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<SpeechRecResult>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
function getSpeechRecognition(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export function VoiceDesk({
  projects,
  snapshots,
  initialProjectId,
  preselected = false,
  defaultSend,
  whatsappReady,
  perms,
  guide,
  serverSpeech,
}: {
  projects: ProjectOption[];
  snapshots: Record<string, ProjectSnapshot>;
  initialProjectId: string;
  /** A project was chosen via the link; don't auto-switch to the nearest site. */
  preselected?: boolean;
  defaultSend: boolean;
  whatsappReady: boolean;
  perms: Perms;
  guide: { focus: string; example: string };
  /** True when the server can transcribe recordings (OPENAI_API_KEY set); otherwise the phone's own dictation is used. */
  serverSpeech: boolean;
}) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [step, setStep] = useState<"capture" | "review" | "done">("capture");

  // Capture
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [typed, setTyped] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Review
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UnderstandResult | null>(null);
  const [draft, setDraft] = useState<VoiceProposal | null>(null);
  const [answer, setAnswer] = useState("");
  const [sendToClient, setSendToClient] = useState(defaultSend);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState<{
    sendStatus: string | null;
    changes: number;
  } | null>(null);

  // Phone dictation (used when server speech-to-text isn't configured)
  const [useServerSpeech, setUseServerSpeech] = useState(serverSpeech);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [dictLang, setDictLang] = useState("en-IN");
  const recognition = useRef<SpeechRec | null>(null);
  const [dictationSupported, setDictationSupported] = useState(true);
  useEffect(() => {
    const supported = !!getSpeechRecognition();
    setDictationSupported(supported);
    // Prefer the phone's own voice typing: free, works in Hindi/English/Arabic and needs no extra service.
    if (supported) setUseServerSpeech(false);
  }, []);

  const project = projects.find((p) => p.id === projectId);
  const audioSrc = useMemo(
    () => (audio ? URL.createObjectURL(audio) : null),
    [audio],
  );
  const uploading = photos.some((p) => !p.url && !p.error && !p.offline);

  // Offline queue
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState<QueuedUpdate[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshQueue = () => {
    if (queue.supported())
      queue
        .list()
        .then(setQueued)
        .catch(() => {});
  };
  useEffect(() => {
    setOnline(navigator.onLine);
    refreshQueue();
    const on = () => {
      setOnline(true);
      refreshQueue();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Nearest site (GPS)
  const [geo, setGeo] = useState<{
    busy?: boolean;
    here?: { lat: number; lng: number };
    nearestId?: string;
    dist?: number;
    msg?: string;
  }>({});
  function locate(auto = false) {
    if (!("geolocation" in navigator))
      return (
        !auto && setGeo({ msg: "Location isn't available on this device." })
      );
    setGeo({ busy: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const ranked = projects
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({ p, d: distanceM(here, { lat: p.lat!, lng: p.lng! }) }))
          .sort((a, b) => a.d - b.d);
        const best = ranked[0];
        if (best && best.d <= NEAR_M) {
          if (!recording && !photos.length) setProjectId(best.p.id);
          setGeo({ here, nearestId: best.p.id, dist: best.d });
        } else {
          setGeo({
            here,
            msg: best
              ? `Nearest saved site is ${(best.d / 1000).toFixed(1)} km away (${best.p.name}).`
              : "No site locations saved yet.",
          });
        }
      },
      () =>
        setGeo(
          auto
            ? {}
            : {
                msg: "Couldn't get your location. Allow location access for this site in your browser.",
              },
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }
  useEffect(() => {
    if (preselected || !projects.some((p) => p.lat != null)) return;
    // Only auto-locate when the person already allowed it, so we never pop a permission prompt on load.
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((r) => r.state === "granted" && locate(true))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function saveHereAsSite() {
    if (!geo.here || !project) return;
    const r = await setSiteLocation(project.id, geo.here.lat, geo.here.lng);
    if ("error" in r) setGeo((g) => ({ ...g, msg: r.error }));
    else {
      project.lat = geo.here.lat;
      project.lng = geo.here.lng;
      setGeo((g) => ({ here: g.here, nearestId: project.id, dist: 0 }));
    }
  }

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudio(
          new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }),
        );
      };
      rec.start(1000);
      recorder.current = rec;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "NotAllowedError" || name === "SecurityError")
        setError(
          "Microphone permission is off for this site. On iPhone: tap “aA” in the address bar → Website Settings → Microphone → Allow. Or use phone voice typing / type the update.",
        );
      else if (
        !navigator.mediaDevices?.getUserMedia ||
        name === "NotSupportedError"
      )
        setError(
          "This browser can't record voice notes — switched to phone voice typing.",
        );
      else
        setError(
          `Microphone not available (${name || "unknown"}). Try phone voice typing, or type the update below.`,
        );
      if (getSpeechRecognition()) setUseServerSpeech(false);
    }
  }

  function stopRecording() {
    recorder.current?.stop();
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
  }

  function startDictation() {
    const Rec = getSpeechRecognition();
    if (!Rec) return setDictationSupported(false);
    setError(null);
    const rec = new Rec();
    rec.lang = dictLang;
    rec.continuous = !/iPad|iPhone|iPod/.test(navigator.userAgent);
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText)
        setTyped((t) =>
          t ? `${t.trimEnd()} ${finalText.trim()}` : finalText.trim(),
        );
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setError(
          "Microphone or speech recognition is blocked. Allow it in your browser settings, or type the update.",
        );
      else if (e.error !== "no-speech" && e.error !== "aborted")
        setError(
          `Voice typing stopped (${e.error}). Tap the mic to continue, or type.`,
        );
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  function stopDictation() {
    recognition.current?.stop();
  }

  async function uploadPhoto(key: string, blob: Blob, forProject: string) {
    if (!navigator.onLine) {
      setPhotos((p) =>
        p.map((x) => (x.key === key ? { ...x, blob, offline: true } : x)),
      );
      return;
    }
    setPhotos((p) =>
      p.map((x) =>
        x.key === key ? { ...x, blob, offline: false, error: undefined } : x,
      ),
    );
    try {
      const body = new FormData();
      body.append("projectId", forProject);
      body.append(
        "file",
        new File([blob], `site-${Date.now()}.jpg`, {
          type: blob.type || "image/jpeg",
        }),
      );
      const res = await fetch("/api/upload", { method: "POST", body });
      const raw = await res.text();
      let json: { url?: string; error?: string } = {};
      try {
        json = JSON.parse(raw);
      } catch {
        json = {
          error:
            res.status === 413
              ? "Photo is too large"
              : `Upload failed (${res.status})`,
        };
      }
      if (!res.ok || !json.url)
        throw new Error(json.error || `Upload failed (${res.status})`);
      setPhotos((p) =>
        p.map((x) => (x.key === key ? { ...x, url: json.url } : x)),
      );
    } catch (e) {
      if (isNetworkError(e))
        return setPhotos((p) =>
          p.map((x) => (x.key === key ? { ...x, offline: true } : x)),
        );
      const message = (e as Error).message || "Upload failed";
      setPhotos((p) =>
        p.map((x) => (x.key === key ? { ...x, error: message } : x)),
      );
      setError(`Photo not uploaded: ${message}`);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files || !projectId) return;
    const added: Photo[] = Array.from(files).map((f) => ({
      key: crypto.randomUUID(),
      preview: URL.createObjectURL(f),
      clientVisible: true,
    }));
    setPhotos((p) => [...p, ...added]);
    await Promise.all(
      Array.from(files).map(async (file, i) =>
        uploadPhoto(added[i].key, await compress(file), projectId),
      ),
    );
  }

  // Retry photos taken offline once signal returns.
  useEffect(() => {
    if (online)
      photos
        .filter((p) => p.offline && p.blob)
        .forEach((p) => uploadPhoto(p.key, p.blob!, projectId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function saveOffline() {
    if (!queue.supported() || !project)
      return setError(
        "This browser can't store updates offline. Keep the screen open and try again when you have signal.",
      );
    await queue.add({
      id: crypto.randomUUID(),
      projectId,
      projectName: project.name,
      typed,
      audio,
      photos: photos.filter((p) => p.blob && !p.error).map((p) => p.blob!),
      createdAt: Date.now(),
    });
    reset();
    refreshQueue();
    setNotice(
      `No signal — update for ${project.name} saved on this phone. Open the desk when you're back online to send it.`,
    );
  }

  async function resumeQueued(item: QueuedUpdate) {
    reset();
    setProjectId(item.projectId);
    setTyped(item.typed);
    if (item.audio) {
      setAudio(item.audio);
      setUseServerSpeech(true);
    }
    const restored: Photo[] = item.photos.map((b) => ({
      key: crypto.randomUUID(),
      preview: URL.createObjectURL(b),
      clientVisible: true,
      blob: b,
    }));
    setPhotos(restored);
    await queue.remove(item.id);
    refreshQueue();
    setNotice(
      `Restored the update for ${item.projectName}. Check it and tap Continue.`,
    );
    await Promise.all(
      restored.map((p) => uploadPhoto(p.key, p.blob!, item.projectId)),
    );
  }

  async function discardQueued(id: string) {
    await queue.remove(id);
    refreshQueue();
  }

  async function understand(extra?: string) {
    if (!projectId) return;
    if (extra === undefined && !navigator.onLine) return saveOffline();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = new FormData();
      body.append("projectId", projectId);
      if (extra !== undefined) {
        body.append("earlier", result?.transcript ?? "");
        body.append("text", extra);
      } else {
        body.append("text", typed);
        if (audio)
          body.append(
            "audio",
            new File(
              [audio],
              `voice.${audio.type.includes("mp4") ? "m4a" : "webm"}`,
              { type: audio.type },
            ),
          );
      }
      const res = await fetch("/api/voice/understand", {
        method: "POST",
        body,
      });
      const json = await res
        .json()
        .catch(() => ({ error: `Something went wrong (${res.status})` }));
      if (!res.ok) {
        if (json.speechFailed) {
          // Server voice-to-text failed: switch to the phone's own voice typing so work can continue.
          setAudio(null);
          setUseServerSpeech(false);
        }
        throw new Error(json.error || "Something went wrong");
      }
      const r = json as UnderstandResult;
      // Keep the original voice note when answering a follow-up question.
      setResult({ ...r, audioUrl: r.audioUrl ?? result?.audioUrl });
      setDraft(r.proposal);
      setAnswer("");
      setStep("review");
    } catch (e) {
      if (extra === undefined && isNetworkError(e)) await saveOffline();
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!draft || !result) return;
    setError(null);
    startSaving(async () => {
      const res = await confirmVoiceUpdate({
        projectId,
        transcript: result.transcript,
        audioUrl: result.audioUrl ?? null,
        summary: draft.summary,
        stageUpdates: draft.stageUpdates,
        payments: draft.payments,
        orders: draft.orders,
        visits: draft.visits,
        designNotes: draft.designNotes,
        issues: draft.issues,
        photos: photos
          .filter((p) => p.url)
          .map((p) => ({ url: p.url!, clientVisible: p.clientVisible })),
        sendToClient,
        clientMessage: draft.clientMessage,
      });
      if (!res.ok) return setError(res.error);
      setSaved({
        sendStatus: res.sendStatus,
        changes:
          draft.stageUpdates.length +
          draft.payments.length +
          draft.orders.length +
          draft.visits.length,
      });
      setStep("done");
    });
  }

  function reset() {
    setStep("capture");
    setAudio(null);
    setTyped("");
    setPhotos([]);
    setResult(null);
    setDraft(null);
    setSaved(null);
    setError(null);
    setSendToClient(defaultSend);
  }

  const patch = (p: Partial<VoiceProposal>) =>
    setDraft((d) => (d ? { ...d, ...p } : d));

  if (!projects.length) {
    return (
      <p className="card p-6 text-center text-sm text-muted">
        There are no active projects you can update yet.
      </p>
    );
  }

  // ---------- Done ----------
  if (step === "done" && saved) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-olive text-white">
            <Check />
          </div>
          <h1 className="h-display text-3xl">Update saved</h1>
          <p className="mt-1 text-sm text-muted">
            {project?.name} · {saved.changes} change
            {saved.changes === 1 ? "" : "s"} recorded
          </p>
          {saved.sendStatus && (
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${saved.sendStatus.startsWith("sent") ? "bg-olive-soft text-olive" : "bg-clay-soft text-clay"}`}
            >
              Client update: {saved.sendStatus}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button onClick={reset} className="btn-brass">
              New update
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Review ----------
  if (step === "review" && draft && result) {
    const o = result.options;
    const cur = o.currency;
    return (
      <div className="mx-auto grid max-w-2xl gap-4">
        <div>
          <button
            onClick={() => setStep("capture")}
            className="text-xs font-semibold text-muted hover:text-ink"
          >
            ← Back to recording
          </button>
          <h1 className="h-display text-3xl">Check before saving</h1>
          <p className="mt-2 rounded-xl bg-brass-soft px-3 py-2 text-sm font-semibold text-brass">
            Not saved yet — check below, then tap “Confirm &amp; save” at the
            bottom.
          </p>
          <p className="text-sm text-muted">
            {project?.name} — edit anything the AI got wrong, untick what
            shouldn&apos;t be saved.
          </p>
        </div>

        {result.notice && (
          <p className="rounded-xl bg-brass-soft px-4 py-2 text-xs text-brass">
            {result.notice}
          </p>
        )}

        {draft.clarification && (
          <div className="card border-brass/40 bg-brass-soft/40 p-4">
            <p className="text-sm font-semibold">{draft.clarification}</p>
            <div className="mt-2 flex gap-2">
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Your answer"
                className="input"
              />
              <button
                onClick={() => understand(answer)}
                disabled={!answer.trim() || busy}
                className="btn-primary shrink-0"
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  "Answer"
                )}
              </button>
            </div>
          </div>
        )}

        <div className="card p-4">
          <label className="label">What was reported</label>
          <textarea
            value={draft.summary}
            onChange={(e) => patch({ summary: e.target.value })}
            rows={2}
            className="input"
          />
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted">
              What the AI heard
            </summary>
            <p className="mt-1 whitespace-pre-line rounded-lg bg-ivory p-2 text-xs">
              {result.transcript}
            </p>
          </details>
        </div>

        {perms.stages && (
          <ReviewBlock
            title="Stage progress"
            onAdd={() =>
              o.stages[0] &&
              patch({
                stageUpdates: [
                  ...draft.stageUpdates,
                  {
                    stageId: o.stages[0].id,
                    status: "IN_PROGRESS",
                    progress: o.stages[0].progress,
                  },
                ],
              })
            }
            empty={!draft.stageUpdates.length}
          >
            {draft.stageUpdates.map((s, i) => (
              <Row
                key={i}
                onRemove={() =>
                  patch({
                    stageUpdates: draft.stageUpdates.filter((_, j) => j !== i),
                  })
                }
              >
                <select
                  value={s.stageId}
                  onChange={(e) =>
                    patch({
                      stageUpdates: draft.stageUpdates.map((x, j) =>
                        j === i ? { ...x, stageId: e.target.value } : x,
                      ),
                    })
                  }
                  className="input"
                >
                  {o.stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} (now {st.progress}%)
                    </option>
                  ))}
                </select>
                <select
                  value={s.status}
                  onChange={(e) => {
                    const status = e.target
                      .value as (typeof STAGE_STATUSES)[number][0];
                    patch({
                      stageUpdates: draft.stageUpdates.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              status,
                              progress: status === "DONE" ? 100 : x.progress,
                            }
                          : x,
                      ),
                    });
                  }}
                  className="input"
                >
                  {STAGE_STATUSES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={s.progress}
                    onChange={(e) =>
                      patch({
                        stageUpdates: draft.stageUpdates.map((x, j) =>
                          j === i
                            ? { ...x, progress: Number(e.target.value) }
                            : x,
                        ),
                      })
                    }
                    className="input"
                    aria-label="Progress"
                  />
                  <span className="text-sm text-muted">%</span>
                </div>
              </Row>
            ))}
          </ReviewBlock>
        )}

        {perms.payments && (
          <ReviewBlock
            title="Payments received"
            onAdd={() => {
              const m =
                o.milestones.find((x) => x.status !== "PAID") ??
                o.milestones[0];
              if (m)
                patch({
                  payments: [
                    ...draft.payments,
                    { milestoneId: m.id, amount: m.amount },
                  ],
                });
            }}
            empty={!draft.payments.length}
          >
            {draft.payments.map((p, i) => (
              <Row
                key={i}
                onRemove={() =>
                  patch({ payments: draft.payments.filter((_, j) => j !== i) })
                }
              >
                <select
                  value={p.milestoneId}
                  onChange={(e) =>
                    patch({
                      payments: draft.payments.map((x, j) =>
                        j === i ? { ...x, milestoneId: e.target.value } : x,
                      ),
                    })
                  }
                  className="input"
                >
                  {o.milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({cur} {m.amount.toLocaleString()})
                      {m.status === "PAID" ? " — already paid" : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={p.amount}
                  onChange={(e) =>
                    patch({
                      payments: draft.payments.map((x, j) =>
                        j === i ? { ...x, amount: Number(e.target.value) } : x,
                      ),
                    })
                  }
                  className="input"
                  aria-label={`Amount ${cur}`}
                />
                <input
                  value={p.reference ?? ""}
                  placeholder="NEFT / cheque"
                  onChange={(e) =>
                    patch({
                      payments: draft.payments.map((x, j) =>
                        j === i ? { ...x, reference: e.target.value } : x,
                      ),
                    })
                  }
                  className="input"
                />
              </Row>
            ))}
          </ReviewBlock>
        )}

        {perms.orders && (
          <ReviewBlock
            title="Orders & deliveries"
            onAdd={() =>
              patch({
                orders: [
                  ...draft.orders,
                  { orderId: null, item: "", status: "ORDERED" },
                ],
              })
            }
            empty={!draft.orders.length}
          >
            {draft.orders.map((ord, i) => (
              <Row
                key={i}
                onRemove={() =>
                  patch({ orders: draft.orders.filter((_, j) => j !== i) })
                }
              >
                <select
                  value={ord.orderId ?? ""}
                  onChange={(e) => {
                    const existing = o.orders.find(
                      (x) => x.id === e.target.value,
                    );
                    patch({
                      orders: draft.orders.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              orderId: existing?.id ?? null,
                              item: existing?.item ?? x.item,
                            }
                          : x,
                      ),
                    });
                  }}
                  className="input"
                >
                  <option value="">New order…</option>
                  {o.orders.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.item}
                    </option>
                  ))}
                </select>
                {!ord.orderId && (
                  <input
                    value={ord.item}
                    placeholder="Item"
                    onChange={(e) =>
                      patch({
                        orders: draft.orders.map((x, j) =>
                          j === i ? { ...x, item: e.target.value } : x,
                        ),
                      })
                    }
                    className="input"
                  />
                )}
                <select
                  value={ord.status}
                  onChange={(e) =>
                    patch({
                      orders: draft.orders.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              status: e.target
                                .value as (typeof ORDER_STATUSES)[number][0],
                            }
                          : x,
                      ),
                    })
                  }
                  className="input"
                >
                  {ORDER_STATUSES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={ord.eta ?? ""}
                  onChange={(e) =>
                    patch({
                      orders: draft.orders.map((x, j) =>
                        j === i ? { ...x, eta: e.target.value } : x,
                      ),
                    })
                  }
                  className="input"
                  aria-label="ETA"
                />
              </Row>
            ))}
          </ReviewBlock>
        )}

        {perms.visits && (
          <ReviewBlock
            title="Visits & meetings"
            onAdd={() =>
              patch({
                visits: [
                  ...draft.visits,
                  { visitId: null, title: "Site visit", at: "" },
                ],
              })
            }
            empty={!draft.visits.length}
          >
            {draft.visits.map((v, i) => (
              <Row
                key={i}
                onRemove={() =>
                  patch({ visits: draft.visits.filter((_, j) => j !== i) })
                }
              >
                <input
                  value={v.title}
                  onChange={(e) =>
                    patch({
                      visits: draft.visits.map((x, j) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    })
                  }
                  className="input"
                />
                <input
                  type="datetime-local"
                  value={v.at.slice(0, 16)}
                  onChange={(e) =>
                    patch({
                      visits: draft.visits.map((x, j) =>
                        j === i ? { ...x, at: e.target.value } : x,
                      ),
                    })
                  }
                  className="input"
                />
                {v.visitId && (
                  <span className="text-xs text-muted">
                    Moves the existing visit
                  </span>
                )}
              </Row>
            ))}
          </ReviewBlock>
        )}

        <div className="card grid gap-3 p-4">
          {perms.design && (
            <div>
              <label className="label">Design notes (one per line)</label>
              <textarea
                value={draft.designNotes.join("\n")}
                onChange={(e) =>
                  patch({ designNotes: e.target.value.split("\n") })
                }
                rows={2}
                className="input"
              />
            </div>
          )}
          <div>
            <label className="label">
              Issues / waiting on (one per line, internal)
            </label>
            <textarea
              value={draft.issues.join("\n")}
              onChange={(e) => patch({ issues: e.target.value.split("\n") })}
              rows={2}
              className="input"
            />
          </div>
        </div>

        {photos.length > 0 && (
          <div className="card p-4">
            <p className="label">
              Photos — tap to include or exclude for the client
            </p>
            <div className="flex flex-wrap gap-2">
              {photos
                .filter((p) => p.url)
                .map((p) => (
                  <button
                    key={p.key}
                    onClick={() =>
                      setPhotos((all) =>
                        all.map((x) =>
                          x.key === p.key
                            ? { ...x, clientVisible: !x.clientVisible }
                            : x,
                        ),
                      )
                    }
                    className="relative"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.preview}
                      alt=""
                      className={`h-20 w-20 rounded-lg object-cover ${p.clientVisible && sendToClient ? "" : "opacity-40"}`}
                    />
                    {p.clientVisible && sendToClient && (
                      <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-olive text-white">
                        <Check size={12} />
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className={`card p-4 ${sendToClient ? "border-olive/40" : ""}`}>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block font-semibold">
                Send update to {o.clientName}
              </span>
              <span className="text-xs text-muted">
                {whatsappReady
                  ? "Goes to the client on WhatsApp"
                  : "WhatsApp isn't connected yet — the message will be saved as queued"}
              </span>
            </span>
            <input
              type="checkbox"
              checked={sendToClient}
              onChange={(e) => setSendToClient(e.target.checked)}
              className="peer sr-only"
            />
            <span className="relative h-7 w-12 shrink-0 rounded-full bg-line transition peer-checked:bg-olive after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          </label>
          {sendToClient && (
            <div className="mt-3">
              <label className="label">Message to client (edit freely)</label>
              <textarea
                value={draft.clientMessage}
                onChange={(e) => patch({ clientMessage: e.target.value })}
                rows={6}
                className="input"
              />
              <p className="mt-1 text-xs text-muted">
                Internal notes, issues, vendor names and prices are never sent.
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-xl bg-clay-soft px-4 py-2 text-sm text-clay">
            {error}
          </p>
        )}
        <div className="sticky bottom-20 z-10 lg:bottom-4">
          <button
            onClick={save}
            disabled={
              saving ||
              !draft.summary.trim() ||
              (sendToClient && !draft.clientMessage.trim())
            }
            className="btn-primary w-full py-3.5 text-base shadow-lg"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : sendToClient ? (
              <Send size={18} />
            ) : (
              <Check size={18} />
            )}
            {saving
              ? "Saving…"
              : sendToClient
                ? "Confirm & send to client"
                : "Confirm & save"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- Capture ----------
  return (
    <div className="mx-auto grid max-w-lg gap-4">
      <div>
        <h1 className="h-display text-3xl">New update</h1>
        <p className="text-sm text-muted">
          You record:{" "}
          {guide.focus.charAt(0).toLowerCase() + guide.focus.slice(1)}.
        </p>
      </div>

      {!online && (
        <p className="flex items-center gap-2 rounded-xl bg-brass-soft px-4 py-2 text-sm text-brass">
          <CloudOff size={16} /> No signal — record as usual. The update is kept
          on this phone and sent when you&apos;re back online.
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-olive-soft px-4 py-2 text-sm text-olive">
          {notice}
        </p>
      )}
      {queued.length > 0 && (
        <div className="card p-4">
          <p className="label">Saved on this phone ({queued.length})</p>
          <ul className="divide-y divide-line">
            {queued.map((q) => (
              <li
                key={q.id}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  <span className="font-semibold">{q.projectName}</span>
                  <span className="block text-xs text-muted">
                    {new Date(q.createdAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {q.audio ? "voice note" : "text"}
                    {q.photos.length
                      ? ` · ${q.photos.length} photo${q.photos.length > 1 ? "s" : ""}`
                      : ""}
                  </span>
                </span>
                <span className="flex gap-1">
                  <button
                    onClick={() => resumeQueued(q)}
                    disabled={!online || recording || listening}
                    className="btn-brass px-3 py-1.5 text-xs"
                  >
                    {online ? "Send now" : "Waiting for signal"}
                  </button>
                  <button
                    onClick={() => discardQueued(q.id)}
                    className="btn-ghost px-2 py-1.5 text-xs text-clay"
                    aria-label="Discard"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <label className="label mb-0" htmlFor="project">
            Project
          </label>
          <button
            type="button"
            onClick={() => locate()}
            disabled={geo.busy}
            className="flex items-center gap-1 text-xs font-semibold text-brass"
          >
            {geo.busy ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <MapPin size={14} />
            )}{" "}
            Nearest site
          </button>
        </div>
        <div className="mt-1" />
        <select
          id="project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="input text-base"
          disabled={recording || photos.length > 0}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.client}
            </option>
          ))}
        </select>
        {geo.nearestId === projectId && geo.dist != null && (
          <p className="mt-1 text-xs text-olive">
            📍 You&apos;re at this site
            {geo.dist > 30 ? ` (${Math.round(geo.dist)} m)` : ""}
          </p>
        )}
        {geo.msg && <p className="mt-1 text-xs text-muted">{geo.msg}</p>}
        {geo.here && geo.nearestId !== projectId && project && (
          <button
            type="button"
            onClick={saveHereAsSite}
            className="mt-1 text-xs font-semibold text-brass underline"
          >
            Save my current location as the site for {project.name}
          </button>
        )}
        {snapshots[projectId] && <Snapshot s={snapshots[projectId]} />}
      </div>

      {useServerSpeech ? (
        <div className="card flex flex-col items-center p-6 text-center">
          {(recording || !audio) && (
            <Zuki
              state={recording ? "listening" : "idle"}
              bubble={
                recording
                  ? `I'm listening… ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
                  : `What happened on site? e.g. “${guide.example}” — Hindi, English or Hinglish is fine.`
              }
              hint={
                recording ? "Tap Zuki when you're done" : "Tap Zuki and speak"
              }
              onTap={recording ? stopRecording : startRecording}
            />
          )}
          {!recording && audio && (
            <div className="w-full">
              <audio controls src={audioSrc ?? undefined} className="w-full" />
              <button onClick={() => setAudio(null)} className="btn-ghost mt-3">
                <RotateCcw size={16} /> Record again
              </button>
            </div>
          )}
          {!recording && (
            <button
              type="button"
              onClick={() => {
                setAudio(null);
                setUseServerSpeech(false);
              }}
              className="mt-3 text-xs font-semibold text-muted underline"
            >
              Use phone voice typing instead
            </button>
          )}
        </div>
      ) : (
        <div className="card flex flex-col items-center p-6 text-center">
          <div className="mb-4 flex gap-1 rounded-full bg-ivory p-1 text-xs font-semibold">
            {[
              ["en-IN", "English"],
              ["hi-IN", "हिन्दी"],
              ["ar-AE", "عربي"],
            ].map(([code, label]) => (
              <button
                key={code}
                type="button"
                disabled={listening}
                onClick={() => setDictLang(code)}
                className={`rounded-full px-3 py-1.5 ${dictLang === code ? "bg-ink text-paper" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Zuki
            state={listening ? "listening" : "idle"}
            bubble={
              listening
                ? "I'm listening…"
                : typed.trim()
                  ? "Got it! Tap me again to add more, add photos if you like, then tap Continue below to check and save."
                  : dictationSupported
                    ? `What happened on site? e.g. “${guide.example}” — your words appear in the box below.`
                    : "Voice typing isn't supported in this browser — tap the box below and use the 🎤 on your keyboard."
            }
            userText={listening && interim ? interim : undefined}
            hint={
              listening ? "Tap Zuki when you're done" : "Tap Zuki and speak"
            }
            onTap={listening ? stopDictation : startDictation}
            disabled={!dictationSupported}
          />
          {serverSpeech && !listening && (
            <button
              type="button"
              onClick={() => setUseServerSpeech(true)}
              className="mt-3 text-xs font-semibold text-muted underline"
            >
              Record a voice note instead
            </button>
          )}
        </div>
      )}

      <div className="card p-4">
        <label className="label" htmlFor="typed">
          {!useServerSpeech
            ? "Your update (edit if needed)"
            : audio
              ? "Anything to add? (optional)"
              : "Or type the update"}
        </label>
        <textarea
          id="typed"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          rows={3}
          className="input"
          placeholder="Carpentry 70%, kitchen shutters fixed…"
        />
      </div>

      <div className="card p-4">
        <p className="label">Photos</p>
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.preview}
                alt=""
                className="h-20 w-20 rounded-lg object-cover"
              />
              {p.offline && (
                <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-brass px-1 text-[10px] text-white">
                  Saved offline
                </span>
              )}
              {!p.url && !p.error && !p.offline && (
                <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/40 text-white">
                  <Loader2 className="animate-spin" size={18} />
                </span>
              )}
              {p.error && (
                <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-clay px-1 text-[10px] text-white">
                  Failed
                </span>
              )}
              <button
                onClick={() =>
                  setPhotos((all) => all.filter((x) => x.key !== p.key))
                }
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white"
                aria-label="Remove photo"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-muted hover:border-brass hover:text-brass">
            <Camera size={22} />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => addPhotos(e.target.files)}
            />
          </label>
          <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-muted hover:border-brass hover:text-brass">
            <ImagePlus size={22} />
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => addPhotos(e.target.files)}
            />
          </label>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-clay-soft px-4 py-2 text-sm text-clay">
          {error}
        </p>
      )}

      <div className="sticky bottom-20 z-10 lg:bottom-4">
        <button
          onClick={() => understand()}
          disabled={
            busy ||
            recording ||
            listening ||
            uploading ||
            (!audio && !typed.trim())
          }
          className={`btn-primary w-full py-3.5 text-base shadow-lg ${(audio || typed.trim()) && !busy && !listening && !recording ? "ring-4 ring-brass/40" : ""}`}
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : null}
          {busy
            ? "Understanding your update…"
            : uploading
              ? "Uploading photos…"
              : online
                ? "Continue — check & save"
                : "Save on this phone"}
        </button>
      </div>
    </div>
  );
}

function ReviewBlock({
  title,
  children,
  onAdd,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  onAdd: () => void;
  empty: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="label mb-0">{title}</p>
        <button onClick={onAdd} className="text-xs font-semibold text-brass">
          + Add
        </button>
      </div>
      {empty ? (
        <p className="text-xs text-muted">Nothing heard for this.</p>
      ) : (
        <div className="grid gap-2">{children}</div>
      )}
    </div>
  );
}

function Row({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line p-2">
      <div className="grid flex-1 gap-2 sm:grid-cols-3">{children}</div>
      <button
        onClick={onRemove}
        className="mt-2 text-muted hover:text-clay"
        aria-label="Remove"
      >
        <X size={16} />
      </button>
    </div>
  );
}
