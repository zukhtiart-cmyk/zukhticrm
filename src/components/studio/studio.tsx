"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Home3D } from "@/components/home3d/home-3d";
import type { ViewerApi } from "@/components/home3d/viewer";
import { ROOM_LABELS, type HomeScene } from "@/lib/home-scene";
import {
  BED_STYLES,
  CEILING_STYLES,
  FEATURE_TREATMENTS,
  FINISH_KINDS,
  FIXTURE_STYLES,
  LEG_STYLES,
  MOODS,
  MOOD_IDS,
  SOFA_STYLES,
  STYLE_LABELS,
  THEMES,
  lookTheme,
  roomTheme,
  type Look,
  type MoodId,
  type RoomStyle,
  type Shot,
  type Theme,
} from "@/lib/themes";
import { shrinkImage } from "@/lib/client-image";
import { createThemeFromBoard, deleteShot, makeOption, readReference, saveLook, saveShot } from "@/app/(app)/projects/studio-actions";
import { saveHomeSnapshot } from "@/app/(app)/projects/design-actions";

type Tab = "theme" | "mood" | "rooms" | "shots";

const MOOD_SWATCH: Record<MoodId, string> = {
  morning: "linear-gradient(135deg,#fff8ec,#cfe3f5)",
  golden: "linear-gradient(135deg,#ffd29a,#e07a3c)",
  evening: "linear-gradient(135deg,#6b4a32,#ffb36b)",
  night: "linear-gradient(135deg,#141824,#3a4a7a)",
  moody: "linear-gradient(135deg,#2a2622,#8a6a4a)",
};

function Swatches({ t }: { t: Theme }) {
  return (
    <span className="flex h-6 overflow-hidden rounded-md border border-line">
      {[t.floor.base, t.wall, t.fabric, t.fabricAlt, t.accent, t.wood].map((c, i) => (
        <span key={i} className="h-full flex-1" style={{ background: c }} />
      ))}
    </span>
  );
}

export function Studio({
  projectId,
  designId,
  scene,
  initialLook,
  library,
  canEdit,
  needsSnapshot,
}: {
  projectId: string;
  designId: string;
  scene: HomeScene;
  initialLook: Look;
  library: Theme[];
  canEdit: boolean;
  needsSnapshot: boolean;
}) {
  const router = useRouter();
  const [look, setLook] = useState<Look>(initialLook);
  const [themes, setThemes] = useState<Theme[]>(library);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>("theme");
  const roomNames = useMemo(() => [...new Set(scene.rooms.map((r) => r.name))], [scene]);
  const [room, setRoom] = useState(roomNames[0] ?? "");
  const [followWalker, setFollowWalker] = useState(true);
  const api = useRef<ViewerApi | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const change = (fn: (l: Look) => Look) => {
    setLook((l) => fn(l));
    setDirty(true);
  };
  const setRoomStyle = (patch: Partial<RoomStyle> | null) =>
    change((l) => {
      const rooms = { ...l.rooms };
      if (patch === null) delete rooms[room];
      else rooms[room] = { ...(rooms[room] ?? {}), ...patch };
      return { ...l, rooms };
    });

  const save = async () => {
    setBusy("save");
    setMsg(null);
    try {
      const blob = (await api.current?.snapshot()) ?? null;
      const f = new FormData();
      f.set("projectId", projectId);
      f.set("id", designId);
      f.set("look", JSON.stringify(look));
      if (blob) f.set("file", new File([blob], "home.jpg", { type: "image/jpeg" }));
      const r = await saveLook(f);
      if (r.error) return setMsg({ text: r.error, bad: true });
      setDirty(false);
      if (r.newVersion && r.id) {
        setMsg({ text: "Saved as a new draft version (the client's copy is unchanged)." });
        router.replace(`/projects/${projectId}/designs/${r.id}/3d`);
      } else {
        setMsg({ text: "Saved." });
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const base = lookTheme(look);
  const rt = room ? roomTheme(look, room) : base;
  const rs = look.rooms[room] ?? {};
  const roomType = scene.rooms.find((r) => r.name === room)?.type;
  const changedRooms = Object.keys(look.rooms).filter((k) => Object.keys(look.rooms[k]).some((x) => x !== "refs"));

  // ---------- Pinterest pictures for a room ----------
  const addRefs = async (files: FileList | null) => {
    if (!files?.length || !room) return;
    setBusy("refs");
    setMsg(null);
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const f = new FormData();
        f.set("projectId", projectId);
        f.set("id", designId);
        f.set("room", room);
        f.set("file", await shrinkImage(file));
        const r = await readReference(f);
        if ("error" in r && r.error) {
          setMsg({ text: r.error, bad: true });
          continue;
        }
        if (!("url" in r) || !r.url) continue;
        change((l) => {
          const cur = l.rooms[room] ?? {};
          const refs = [...(cur.refs ?? []), { url: r.url, note: (r.wallpaper ? "[pattern] " : "") + (r.note ?? "") }].slice(-12);
          return { ...l, rooms: { ...l.rooms, [room]: { ...cur, ...r.style, refs } } };
        });
        setMsg({ text: r.note ? `Applied: ${r.note}` : "Applied the picture's look." });
      }
    } finally {
      setBusy(null);
    }
  };

  // ---------- custom theme from a mood board ----------
  const [boardName, setBoardName] = useState("");
  const boardRef = useRef<HTMLInputElement>(null);
  const makeTheme = async () => {
    const files = boardRef.current?.files;
    if (!files?.length) return setMsg({ text: "Choose 1–8 pictures for the mood board first.", bad: true });
    setBusy("board");
    setMsg(null);
    try {
      const f = new FormData();
      for (const file of Array.from(files).slice(0, 8)) f.append("files", await shrinkImage(file, 1200));
      f.set("name", boardName);
      const r = await createThemeFromBoard(f);
      if (r.error || !r.theme) return setMsg({ text: r.error ?? "Couldn't make a theme.", bad: true });
      const t = r.theme as Theme;
      setThemes((ts) => [t, ...ts]);
      change((l) => ({ ...l, theme: t.id, custom: t }));
      setBoardName("");
      if (boardRef.current) boardRef.current.value = "";
      setMsg({ text: `New theme “${t.label}” made from your pictures and applied. It's saved in your theme library for every project.` });
    } finally {
      setBusy(null);
    }
  };

  // ---------- shots ----------
  const [shotName, setShotName] = useState("");
  const takeShot = async () => {
    if (!api.current) return;
    setBusy("shot");
    try {
      const blob = await api.current.shot();
      if (!blob) return;
      const f = new FormData();
      f.set("projectId", projectId);
      f.set("id", designId);
      f.set("name", shotName || (followWalker && room ? room : ""));
      f.set("mood", look.mood);
      f.set("cam", JSON.stringify(api.current.getCamera()));
      f.set("file", new File([blob], "shot.jpg", { type: "image/jpeg" }));
      const r = await saveShot(f);
      if (r.error) return setMsg({ text: r.error, bad: true });
      setLook((l) => ({ ...l, shots: r.shots as Shot[] }));
      setShotName("");
      setMsg({ text: "View saved. These shots will be rendered photo-real in Phase B." });
    } finally {
      setBusy(null);
    }
  };
  const goShot = (s: Shot) => {
    api.current?.setCamera(s.cam);
    if (s.mood !== look.mood) change((l) => ({ ...l, mood: s.mood }));
  };

  const option = async () => {
    if (dirty) await save();
    setBusy("option");
    try {
      const f = new FormData();
      f.set("projectId", projectId);
      f.set("id", designId);
      const r = await makeOption(f);
      if (r.error || !r.id) return setMsg({ text: r.error ?? "Couldn't copy.", bad: true });
      router.push(`/projects/${projectId}/designs/${r.id}/3d`);
    } finally {
      setBusy(null);
    }
  };

  const color = (label: string, key: keyof RoomStyle & keyof Theme) => (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className={rs[key] ? "font-semibold" : "text-muted"}>{label}</span>
      <input type="color" value={String(rt[key])} onChange={(e) => setRoomStyle({ [key]: e.target.value })} className="h-7 w-12 cursor-pointer rounded border border-line bg-white" disabled={!canEdit} />
    </label>
  );
  const pick = (label: string, key: "bed" | "sofa" | "legs" | "ceiling" | "fixture", list: readonly string[]) => (
    <label className="grid gap-1 text-xs">
      <span className={rs[key] ? "font-semibold" : "text-muted"}>{label}</span>
      <select value={rt[key]} onChange={(e) => setRoomStyle({ [key]: e.target.value } as Partial<RoomStyle>)} className="input py-1.5 text-xs" disabled={!canEdit}>
        {list.map((v) => (
          <option key={v} value={v}>
            {STYLE_LABELS[v] ?? v}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 content-start gap-2">
        <Home3D
          scene={scene}
          look={look}
          explore={!canEdit}
          onReady={(a) => (api.current = a)}
          onRoomChange={(r) => followWalker && setRoom(r)}
          onFirstFrame={
            canEdit && needsSnapshot
              ? async (blob) => {
                  if (sent.current || !blob) return;
                  sent.current = true;
                  const f = new FormData();
                  f.set("projectId", projectId);
                  f.set("id", designId);
                  f.set("file", new File([blob], "home.jpg", { type: "image/jpeg" }));
                  await saveHomeSnapshot(f);
                  router.refresh();
                }
              : undefined
          }
        />
        {msg && (
          <p className={`rounded-lg px-3 py-2 text-sm ${msg.bad ? "bg-clay-soft text-clay" : "bg-olive-soft text-olive"}`} onClick={() => setMsg(null)}>
            {msg.text}
          </p>
        )}
      </div>

      {canEdit && (
        <aside className="grid content-start gap-3">
          <div className="grid grid-cols-4 rounded-full bg-paper p-1 text-xs font-semibold ring-1 ring-line">
            {(["theme", "mood", "rooms", "shots"] as Tab[]).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-full px-2 py-1.5 capitalize transition ${tab === t ? "bg-ink text-white" : "hover:bg-brass-soft"}`}>
                {t === "shots" ? `Shots${look.shots.length ? ` ${look.shots.length}` : ""}` : t}
              </button>
            ))}
          </div>

          {tab === "theme" && (
            <div className="grid gap-3">
              <div className="grid max-h-[46vh] gap-2 overflow-y-auto pr-1">
                {[...themes, ...Object.values(THEMES)].map((t) => {
                  const on = look.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => change((l) => ({ ...l, theme: t.id, custom: t.id.startsWith("custom:") ? t : undefined }))}
                      className={`grid gap-1.5 rounded-xl border p-2.5 text-left transition ${on ? "border-brass bg-brass-soft" : "border-line bg-paper hover:border-brass/50"}`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                        {t.label}
                        {t.id.startsWith("custom:") && <span className="rounded-full bg-olive-soft px-2 py-0.5 text-[10px] text-olive">Yours</span>}
                      </span>
                      <Swatches t={t} />
                      <span className="text-[11px] leading-snug text-muted">{t.blurb}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 rounded-xl border border-dashed border-brass/60 bg-paper p-3 text-xs">
                <p className="font-semibold">Make a theme from Pinterest pictures</p>
                <p className="text-muted">Add 1–8 pictures of the look you want for the whole home. Claude works out the materials, colours and furniture style, and saves it as your own theme for every project.</p>
                <input ref={boardRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="text-xs" />
                <input value={boardName} onChange={(e) => setBoardName(e.target.value)} placeholder="Theme name (optional)" className="input py-1.5 text-xs" />
                <button type="button" onClick={makeTheme} disabled={!!busy} className="btn-brass py-1.5 text-xs">
                  {busy === "board" ? "Reading your pictures…" : "Make theme"}
                </button>
              </div>
              {changedRooms.length > 0 && (
                <p className="text-[11px] text-muted">
                  {changedRooms.length} room{changedRooms.length > 1 ? "s have" : " has"} its own styling on top of the theme ({changedRooms.join(", ")}).{" "}
                  <button type="button" className="underline" onClick={() => change((l) => ({ ...l, rooms: {} }))}>
                    Clear all room styling
                  </button>
                </p>
              )}
            </div>
          )}

          {tab === "mood" && (
            <div className="grid gap-2">
              {MOOD_IDS.map((m) => (
                <button key={m} type="button" onClick={() => change((l) => ({ ...l, mood: m }))} className={`flex items-center gap-3 rounded-xl border p-2.5 text-left text-sm font-semibold transition ${look.mood === m ? "border-brass bg-brass-soft" : "border-line bg-paper hover:border-brass/50"}`}>
                  <span className="h-9 w-14 shrink-0 rounded-lg" style={{ background: MOOD_SWATCH[m] }} />
                  {MOODS[m].label}
                </button>
              ))}
              <p className="text-[11px] text-muted">Mood changes the light: sun angle and colour, lamps and cove lights, and curtains (drawn for Cozy evening). Walk through to see it inside.</p>
            </div>
          )}

          {tab === "rooms" && (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <select value={room} onChange={(e) => (setRoom(e.target.value), setFollowWalker(false))} className="input">
                  {roomNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                      {look.rooms[n] ? " •" : ""}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-[11px] text-muted">
                  <input type="checkbox" checked={followWalker} onChange={(e) => setFollowWalker(e.target.checked)} /> Follow the room I&apos;m walking in
                </label>
              </div>

              <div className="grid gap-2 rounded-xl border border-dashed border-brass/60 bg-paper p-3 text-xs">
                <p className="font-semibold">Pinterest pictures for {room || "this room"}</p>
                <p className="text-muted">Drop pictures of the bed, flooring, wall, colours you want. Each picture is read and applied to this room.</p>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!!busy} onChange={(e) => (addRefs(e.target.files), (e.target.value = ""))} className="text-xs" />
                {busy === "refs" && <p className="text-brass">Reading the picture…</p>}
                {(rs.refs ?? []).length > 0 && (
                  <div className="grid gap-2">
                    {rs.refs!.map((r, i) => (
                      <div key={i} className="flex gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                        <div className="grid min-w-0 content-start gap-1">
                          <p className="text-[11px] leading-snug text-muted">{r.note?.replace("[pattern] ", "")}</p>
                          {r.note?.startsWith("[pattern]") && (
                            <button type="button" className="w-fit rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold ring-1 ring-line" onClick={() => setRoomStyle({ feature: { treatment: "wallpaper", color: rt.feature.color, pattern: r.url } })}>
                              Use as wallpaper
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-2 rounded-xl border border-line bg-paper p-3">
                <p className="text-xs font-semibold">Floor</p>
                <select value={rt.floor.kind} onChange={(e) => setRoomStyle({ floor: { ...rt.floor, kind: e.target.value as Theme["floor"]["kind"] } })} className="input py-1.5 text-xs">
                  {FINISH_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {STYLE_LABELS[k] ?? k}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-between gap-2 text-xs text-muted">
                    Colour
                    <input type="color" value={rt.floor.base} onChange={(e) => setRoomStyle({ floor: { ...rt.floor, base: e.target.value } })} className="h-7 w-12 rounded border border-line" />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-muted">
                    Grain / veins
                    <input type="color" value={rt.floor.alt} onChange={(e) => setRoomStyle({ floor: { ...rt.floor, alt: e.target.value } })} className="h-7 w-12 rounded border border-line" />
                  </label>
                </div>
                <p className="mt-1 text-xs font-semibold">Walls</p>
                {color("Wall paint", "wall")}
                <select value={rt.feature.treatment} onChange={(e) => setRoomStyle({ feature: { treatment: e.target.value as Theme["feature"]["treatment"], color: rt.feature.color } })} className="input py-1.5 text-xs" aria-label="Feature wall">
                  {FEATURE_TREATMENTS.map((k) => (
                    <option key={k} value={k}>
                      Feature wall: {STYLE_LABELS[k] ?? k}
                    </option>
                  ))}
                </select>
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span className={rs.feature ? "font-semibold" : "text-muted"}>Feature wall colour</span>
                  <input type="color" value={rt.feature.color} onChange={(e) => setRoomStyle({ feature: { ...rt.feature, color: e.target.value, pattern: undefined } })} className="h-7 w-12 rounded border border-line" />
                </label>
                {rt.feature.pattern && (
                  <button type="button" className="w-fit text-[11px] underline" onClick={() => setRoomStyle({ feature: { treatment: rt.feature.treatment, color: rt.feature.color } })}>
                    Remove wallpaper picture
                  </button>
                )}
                <p className="mt-1 text-xs font-semibold">Colours &amp; finishes</p>
                {color("Upholstery (sofa, headboard)", "fabric")}
                {color("Bedding & cushions", "fabricAlt")}
                {color("Accent", "accent")}
                {color("Wood", "wood")}
                {color("Dark wood / trims", "woodDark")}
                {color("Cabinets & wardrobe", "cabinet")}
                {roomType === "kitchen" || roomType === "bathroom" ? color("Counter top", "counter") : null}
                {color("Curtains", "curtains")}
                {color("Rug", "rug")}
                {color("Metal", "metal")}
                <p className="mt-1 text-xs font-semibold">Shapes</p>
                <div className="grid grid-cols-2 gap-2">
                  {pick("Bed", "bed", BED_STYLES)}
                  {pick("Sofa", "sofa", SOFA_STYLES)}
                  {pick("Legs", "legs", LEG_STYLES)}
                  {pick("Ceiling", "ceiling", CEILING_STYLES)}
                  {pick("Ceiling light", "fixture", FIXTURE_STYLES)}
                </div>
                <p className="text-[11px] text-muted">
                  Bold = changed for this room; the rest comes from the theme. {roomType ? `(${ROOM_LABELS[roomType]})` : ""}
                </p>
                {look.rooms[room] && (
                  <button type="button" onClick={() => setRoomStyle(null)} className="rounded-lg bg-clay-soft px-2 py-1.5 text-xs font-semibold text-clay">
                    Reset {room} to the theme
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "shots" && (
            <div className="grid gap-3">
              <div className="grid gap-2 rounded-xl border border-line bg-paper p-3 text-xs">
                <p className="text-muted">Frame a view (Walk through or Dollhouse), then save it. Saved shots are the views that get rendered photo-real later.</p>
                <input value={shotName} onChange={(e) => setShotName(e.target.value)} placeholder={room ? `${room} view` : "Name this view"} className="input py-1.5 text-xs" />
                <button type="button" onClick={takeShot} disabled={!!busy} className="btn-brass py-1.5 text-xs">
                  {busy === "shot" ? "Saving…" : "📷 Save this view"}
                </button>
              </div>
              {look.shots.length > 0 && (
                <a href={`/projects/${projectId}/designs/${designId}/renders`} onClick={(e) => dirty && !confirm("You have unsaved changes in the studio. Leave anyway?") && e.preventDefault()} className="btn-primary py-2 text-center text-sm">
                  ✨ Make photo-real pictures →
                </a>
              )}
              <div className="grid grid-cols-2 gap-2">
                {look.shots.map((s) => (
                  <div key={s.id} className="group relative overflow-hidden rounded-lg border border-line bg-paper">
                    <button type="button" onClick={() => goShot(s)} className="block w-full text-left">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {s.url && <img src={s.url} alt={s.name} className="aspect-[16/10] w-full object-cover" />}
                      <span className="block truncate px-2 py-1 text-[11px] font-semibold">{s.name}</span>
                      <span className="block px-2 pb-1 text-[10px] text-muted">{MOODS[s.mood].label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await deleteShot(projectId, designId, s.id);
                        if (!r.error) setLook((l) => ({ ...l, shots: r.shots as Shot[] }));
                      }}
                      className="absolute right-1 top-1 hidden h-6 w-6 rounded-full bg-ink/70 text-xs text-white group-hover:block"
                      aria-label="Delete shot"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sticky bottom-2 grid gap-2">
            <button type="button" onClick={save} disabled={!!busy || !dirty} className="btn-primary">
              {busy === "save" ? "Saving…" : dirty ? "Save design" : "All changes saved"}
            </button>
            <button type="button" onClick={option} disabled={!!busy} className="btn-ghost text-xs">
              {busy === "option" ? "Copying…" : "+ Make another option from this"}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
