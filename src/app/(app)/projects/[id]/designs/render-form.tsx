"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createHomeFromPlan } from "../../design-actions";

const STYLES = [
  ["modern", "Modern", "#c9a77c", "#3f4954"],
  ["luxury", "Luxury", "#f2eee8", "#24414f"],
  ["japandi", "Japandi", "#d8c3a0", "#6b7a5e"],
  ["minimalist", "Minimalist", "#d3cfc8", "#a7a39c"],
  ["scandinavian", "Scandinavian", "#e2cfae", "#7d9bb0"],
  ["traditional", "Traditional", "#8a5a35", "#8c2f2a"],
  ["industrial", "Industrial", "#9d9a94", "#7a4a2a"],
  ["coastal", "Coastal", "#e6dccb", "#4f86a6"],
] as const;

const STEPS = ["Reading the plan…", "Measuring rooms…", "Finding doors and windows…", "Placing furniture…", "Building your home in 3D…"];

/** Shrinks big photos/scans so they upload fast and stay under the reader's size limit. */
async function prepare(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const max = 2000;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.size < 3.5 * 1024 * 1024) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
  return blob ? new File([blob], "plan.jpg", { type: "image/jpeg" }) : file;
}

export function FloorPlanRenderForm({ projectId, rooms }: { projectId: string; rooms: string[] }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ url: string; pdf: boolean; name: string } | null>(null);
  const [style, setStyle] = useState("modern");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pending) return setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  const submit = (form: FormData) => {
    setError(null);
    start(async () => {
      const f = fileRef.current?.files?.[0];
      if (!f) return setError("Choose the floor plan first.");
      form.set("plan", await prepare(f));
      const res = await createHomeFromPlan(undefined, form);
      if (res?.error) return setError(res.error);
      if (res?.id) router.push(`/projects/${projectId}/designs/${res.id}/3d?new=1`);
    });
  };

  return (
    <form action={submit} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="style" value={style} />
      <label className="group relative flex min-h-52 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-paper p-3 text-center transition hover:border-brass">
        {preview ? (
          preview.pdf ? (
            <span className="text-sm font-semibold">📄 {preview.name}</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="Floor plan" className="max-h-64 w-full rounded-lg object-contain" />
          )
        ) : (
          <>
            <svg viewBox="0 0 48 48" className="h-12 w-12 text-brass transition group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 8h36v32H6z M6 22h14v18 M20 8v8 M28 22h14 M28 22v8" />
            </svg>
            <span className="mt-2 font-semibold">Drop or choose the floor plan</span>
            <span className="text-xs text-muted">Image or PDF · room names and sizes on the plan give the best result</span>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? { url: URL.createObjectURL(f), pdf: f.type === "application/pdf", name: f.name } : null);
          }}
        />
      </label>

      <div className="grid content-start gap-3">
        <div>
          <span className="label">Interior style</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STYLES.map(([v, l, a, b]) => (
              <button
                key={v}
                type="button"
                onClick={() => setStyle(v)}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${style === v ? "border-brass bg-brass-soft" : "border-line bg-paper hover:border-brass/50"}`}
              >
                <span className="flex h-5 w-5 shrink-0 overflow-hidden rounded-full border border-line">
                  <span className="h-full w-1/2" style={{ background: a }} />
                  <span className="h-full w-1/2" style={{ background: b }} />
                </span>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Save under room</label>
            <input name="room" list="render-rooms" placeholder="Whole home" className="input" />
            <datalist id="render-rooms">
              {rooms.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Title</label>
            <input name="title" placeholder="3D home" className="input" />
          </div>
        </div>
        <div>
          <label className="label">Note for the plan reader (optional)</label>
          <input name="hint" placeholder="e.g. Sizes are in feet · 3 BHK, top of the plan is north" className="input" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={pending}>
            {pending ? STEPS[Math.min(STEPS.length - 1, Math.floor(secs / 7))] : "Build 3D home"}
          </button>
          <span className="text-xs text-muted">{pending ? `${secs}s` : "About 20–40 seconds · opens a walk-through"}</span>
        </div>
        {pending && (
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brass transition-all duration-1000" style={{ width: `${Math.min(95, secs * 2.6)}%` }} />
          </div>
        )}
        {error && <p className="text-sm text-clay">{error}</p>}
      </div>
    </form>
  );
}
