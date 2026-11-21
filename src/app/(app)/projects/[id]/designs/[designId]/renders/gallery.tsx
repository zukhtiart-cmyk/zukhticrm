"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MOODS, type Shot } from "@/lib/themes";
import { deleteRender, makePhotoReal, makeVideo, makeWalkthrough, setRenderChosen } from "../../../../render-actions";

type R = { id: string; shotId: string | null; parentId: string | null; kind: string; status: string; url: string | null; error: string | null; chosen: boolean; prompt: string | null };
type ShotP = Shot & { prompt: string };

/** Before/after: drag the handle to compare the 3D view with the photo-real picture. */
function Compare({ before, after, onClose }: { before: string; after: string; onClose: () => void }) {
  const [x, setX] = useState(50);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl bg-ink" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt="Photo-real" className="block w-full" />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before} alt="3D view" className="block h-full w-full object-cover" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: `${x}%` }} />
        <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-2 py-0.5 text-xs text-white">3D view</span>
        <span className="absolute right-3 top-3 rounded-full bg-ink/70 px-2 py-0.5 text-xs text-white">Photo-real</span>
        <input type="range" min={0} max={100} value={x} onChange={(e) => setX(+e.target.value)} className="absolute inset-x-6 bottom-4" aria-label="Compare" />
        <button type="button" onClick={onClose} className="absolute right-3 bottom-10 rounded-full bg-paper px-3 py-1 text-xs font-semibold">
          Close
        </button>
      </div>
    </div>
  );
}

export function RendersGallery({ projectId, designId, shots, renders, focus, canEdit }: { projectId: string; designId: string; shots: ShotP[]; renders: R[]; focus?: string; canEdit: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ before: string; after: string } | null>(null);
  const [prompts, setPrompts] = useState<Record<string, string>>(() => Object.fromEntries(shots.map((s) => [s.id, s.prompt])));
  const [level, setLevel] = useState<Record<string, string>>({});
  const [vars, setVars] = useState<Record<string, number>>({});

  // Check running jobs every few seconds (including ones just started here); refresh when any finishes.
  const [started, setStarted] = useState<string[]>([]);
  const finished = new Set(renders.filter((r) => r.status !== "working").map((r) => r.id));
  const working = [...new Set([...renders.filter((r) => r.status === "working").map((r) => r.id), ...started.filter((id) => !finished.has(id))])];
  const key = working.join(",");
  useEffect(() => {
    if (!working.length) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const states = await Promise.all(working.map((id) => fetch(`/api/renders/${id}`, { cache: "no-store" }).then((r) => r.json() as Promise<{ status: string }>).catch(() => ({ status: "working" }))));
      if (stop) return;
      if (states.some((s) => s.status !== "working")) router.refresh();
      setTimeout(tick, 5000);
    };
    const t = setTimeout(tick, 4000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (focus) document.getElementById(`shot-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  const run = async (tag: string, fn: () => Promise<{ error?: string; ok?: boolean; id?: string; ids?: string[] } | undefined>, okText: string) => {
    setBusy(tag);
    setMsg(null);
    try {
      const r = await fn();
      if (r?.error) setMsg({ text: r.error, bad: true });
      else {
        const ids = [...(r?.ids ?? []), ...(r?.id ? [r.id] : [])];
        if (ids.length) setStarted((s) => [...s, ...ids]);
        setMsg({ text: okText });
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    f.set("projectId", projectId);
    f.set("id", designId);
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };

  return (
    <div className="grid gap-5">
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.bad ? "bg-clay-soft text-clay" : "bg-olive-soft text-olive"}`} onClick={() => setMsg(null)}>
          {msg.text}
        </p>
      )}
      {shots.map((s) => {
        const photos = renders.filter((r) => r.kind === "photo" && r.shotId === s.id);
        const lv = level[s.id] ?? "quick";
        const n = vars[s.id] ?? 1;
        const per = lv === "lite" ? 8 : lv === "pro" ? 15 : 10;
        return (
          <section key={s.id} id={`shot-${s.id}`} className="grid gap-3 rounded-2xl border border-line bg-paper p-3 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="grid content-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.url && <img src={s.url} alt={s.name} className="aspect-[16/10] w-full rounded-xl object-cover" />}
              <p className="text-sm font-semibold">
                {s.name} <span className="text-xs font-normal text-muted">· {MOODS[s.mood].label}</span>
              </p>
              {canEdit && (
                <>
                  <textarea value={prompts[s.id] ?? ""} onChange={(e) => setPrompts((p) => ({ ...p, [s.id]: e.target.value }))} rows={6} className="input text-xs leading-snug" aria-label="Instruction" />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <select value={lv} onChange={(e) => setLevel((l) => ({ ...l, [s.id]: e.target.value }))} className="input w-auto py-1 text-xs" aria-label="Detail">
                      <option value="lite">Lite (fast)</option>
                      <option value="quick">Standard</option>
                      <option value="pro">Pro (most detail)</option>
                    </select>
                    <select value={n} onChange={(e) => setVars((v) => ({ ...v, [s.id]: +e.target.value }))} className="input w-auto py-1 text-xs" aria-label="Variations">
                      <option value={1}>1 picture</option>
                      <option value={2}>2 variations</option>
                      <option value={3}>3 variations</option>
                    </select>
                    <button type="button" onClick={() => setPrompts((p) => ({ ...p, [s.id]: s.prompt }))} className="underline">
                      Reset instruction
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => run(`photo-${s.id}`, () => makePhotoReal(fd({ shotId: s.id, prompt: prompts[s.id] ?? s.prompt, level: lv, variations: String(n) })), "Making the photo-real picture… it appears here in about 20–60 seconds.")}
                    className="btn-brass py-2 text-sm"
                  >
                    {busy === `photo-${s.id}` ? "Starting…" : `✨ Make photo-real (${per * n} credits)`}
                  </button>
                </>
              )}
            </div>
            <div className="grid content-start gap-3">
              {!photos.length && <p className="text-sm text-muted">No photo-real pictures of this view yet.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {photos.map((p) => {
                  const kids = renders.filter((r) => r.parentId === p.id);
                  return (
                    <div key={p.id} className={`grid content-start gap-2 rounded-xl border p-2 ${p.chosen ? "border-brass bg-brass-soft/40" : "border-line bg-white"}`}>
                      {p.status === "working" && (
                        <div className="grid aspect-[16/10] place-items-center rounded-lg bg-paper text-xs text-muted">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brass border-t-transparent" /> Rendering…
                          </span>
                        </div>
                      )}
                      {p.status === "failed" && <p className="rounded-lg bg-clay-soft p-3 text-xs text-clay">{p.error ?? "It didn't work."}</p>}
                      {p.status === "ready" && p.url && (
                        <button type="button" onClick={() => s.url && setCompare({ before: s.url, after: p.url! })} className="block" title="Compare with the 3D view">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt="Photo-real" className="aspect-[16/10] w-full rounded-lg object-cover" />
                        </button>
                      )}
                      {p.status === "ready" && canEdit && (
                        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                          <button type="button" onClick={() => run(`c-${p.id}`, () => setRenderChosen(projectId, designId, p.id, !p.chosen), p.chosen ? "Hidden from the client." : "Shown to the client in their portal (once the design is shared).")} className={`rounded-full px-2 py-1 ${p.chosen ? "bg-brass text-white" : "bg-paper ring-1 ring-line"}`}>
                            {p.chosen ? "★ Shown to client" : "☆ Show client"}
                          </button>
                          <button type="button" disabled={!!busy} onClick={() => run(`v-${p.id}`, () => makeVideo(fd({ renderId: p.id, seconds: "8" })), "Making an 8-second video… usually 2–5 minutes.")} className="rounded-full bg-paper px-2 py-1 ring-1 ring-line">
                            🎬 Video 8s
                          </button>
                          <button type="button" disabled={!!busy} onClick={() => run(`v4-${p.id}`, () => makeVideo(fd({ renderId: p.id, seconds: "4" })), "Making a 4-second video… usually 2–4 minutes.")} className="rounded-full bg-paper px-2 py-1 ring-1 ring-line">
                            4s
                          </button>
                          <button type="button" disabled={!!busy} onClick={() => run(`w-${p.id}`, () => makeWalkthrough(fd({ renderId: p.id })), "Building the walk-through… about a minute.")} className="rounded-full bg-paper px-2 py-1 ring-1 ring-line">
                            🧭 Walk-through
                          </button>
                          <a href={p.url!} download className="rounded-full bg-paper px-2 py-1 ring-1 ring-line">
                            ⬇
                          </a>
                          <button type="button" onClick={() => run(`d-${p.id}`, () => deleteRender(projectId, designId, p.id), "Deleted.")} className="rounded-full bg-paper px-2 py-1 text-clay ring-1 ring-line" aria-label="Delete">
                            ✕
                          </button>
                        </div>
                      )}
                      {kids.map((k) => (
                        <div key={k.id} className="grid gap-1 rounded-lg bg-paper p-2 text-xs">
                          <span className="font-semibold">{k.kind === "video" ? "🎬 Video" : "🧭 Walk-through"}</span>
                          {k.status === "working" && (
                            <span className="inline-flex items-center gap-2 text-muted">
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-brass border-t-transparent" /> Working…
                            </span>
                          )}
                          {k.status === "failed" && <span className="text-clay">{k.error}</span>}
                          {k.status === "ready" && k.kind === "video" && k.url && <video src={k.url} controls playsInline className="w-full rounded" />}
                          {k.status === "ready" && k.kind === "world" && k.url && (
                            <a href={k.url} target="_blank" className="btn-brass w-fit px-3 py-1 text-xs">
                              Open walk-through ↗
                            </a>
                          )}
                          {k.status === "ready" && canEdit && (
                            <div className="flex gap-1.5">
                              <button type="button" onClick={() => run(`c-${k.id}`, () => setRenderChosen(projectId, designId, k.id, !k.chosen), k.chosen ? "Hidden from the client." : "Shown to the client.")} className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.chosen ? "bg-brass text-white" : "bg-white ring-1 ring-line"}`}>
                                {k.chosen ? "★ Shown to client" : "☆ Show client"}
                              </button>
                              <button type="button" onClick={() => run(`d-${k.id}`, () => deleteRender(projectId, designId, k.id), "Deleted.")} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-clay ring-1 ring-line">
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
      {compare && <Compare before={compare.before} after={compare.after} onClose={() => setCompare(null)} />}
    </div>
  );
}
