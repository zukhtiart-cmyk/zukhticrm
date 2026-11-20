"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { renderFromFloorPlan } from "../../design-actions";

const STYLES = [
  ["photorealistic", "Photorealistic"],
  ["3d-model", "3D model look"],
  ["clay", "Clay (white model)"],
  ["sketch", "Hand sketch"],
  ["drawing", "Line drawing"],
] as const;
const INTERIORS = ["auto", "modern", "luxury", "minimalist", "japandi", "scandinavian", "traditional", "industrial", "coastal"];
const FURNITURE = [
  ["styled", "Styled — furniture, rugs, art, plants"],
  ["furnished", "Furnished — as drawn on the plan"],
  ["empty", "Empty shell"],
] as const;

export function FloorPlanRenderForm({ projectId, rooms }: { projectId: string; rooms: string[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(renderFromFloorPlan, undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [style, setStyle] = useState("photorealistic");
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      setPreview(null);
    }
  }, [state]);
  useEffect(() => {
    if (!pending) return setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  const interiorOn = style === "photorealistic" || style === "3d-model";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <form ref={form} action={action} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="group relative flex min-h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-paper p-3 text-center transition hover:border-brass">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Floor plan" className="max-h-64 w-full rounded-lg object-contain" />
        ) : (
          <>
            <svg viewBox="0 0 48 48" className="h-12 w-12 text-brass" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 8h36v32H6z M6 22h14v18 M20 8v8 M28 22h14 M28 22v8" />
            </svg>
            <span className="mt-2 font-semibold">Drop or choose the floor plan</span>
            <span className="text-xs text-muted">JPG, PNG or WebP · a clean plan with clear walls works best</span>
          </>
        )}
        <input
          name="plan"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Look</label>
          <select name="style" className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
            {STYLES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Interior style</label>
          <select name="interiorStyle" className="input" disabled={!interiorOn} defaultValue="auto">
            {INTERIORS.map((v) => (
              <option key={v} value={v}>
                {v === "auto" ? "Let it decide" : cap(v)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Furniture</label>
          <select name="furniture" className="input" defaultValue="styled">
            {FURNITURE.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Camera</label>
          <select name="view" className="input" defaultValue="isometric">
            <option value="isometric">Isometric (3D angle)</option>
            <option value="topdown">Top-down</option>
          </select>
        </div>
        <div>
          <label className="label">Labels on the picture</label>
          <select name="labels" className="input" defaultValue="none">
            <option value="none">None — clean picture</option>
            <option value="names">Room names</option>
            <option value="full">Names and sizes</option>
          </select>
        </div>
        <div>
          <label className="label">Save under room</label>
          <input name="room" list="render-rooms" placeholder="Floor plan" className="input" />
          <datalist id="render-rooms">
            {rooms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Title (optional)</label>
          <input name="title" placeholder="Made from your choices, e.g. 3D view — Luxury, furnished" className="input" />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button className="btn-primary" disabled={pending}>
            {pending ? `Rendering… ${secs}s` : "Make 3D render"}
          </button>
          <span className="text-xs text-muted">About 20 seconds · 10 MeltFlex credits</span>
        </div>
        {pending && (
          <div className="h-1.5 overflow-hidden rounded-full bg-line sm:col-span-2">
            <div className="h-full rounded-full bg-brass transition-all duration-1000" style={{ width: `${Math.min(95, secs * 4.5)}%` }} />
          </div>
        )}
        {state?.error && <p className="text-sm text-clay sm:col-span-2">{state.error}</p>}
        {state?.ok && <p className="text-sm text-olive sm:col-span-2">{state.ok}</p>}
      </div>
    </form>
  );
}
