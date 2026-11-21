"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_T,
  OPENING_WIDTH,
  ROOM_LABELS,
  ROOM_TYPES,
  alignRooms,
  along,
  axisOf,
  newId,
  project,
  sceneBox,
  wallLen,
  type HomeScene,
  type OpeningType,
  type Pt,
  type RoomType,
  type SceneRoom,
  type Wall,
  type WallKind,
  type WallOpening,
} from "@/lib/home-scene";
import { snapToPlan } from "./snap";

type Tool = "select" | "wall" | "door" | "window" | "opening" | "sliding" | "room" | "scale";
type Sel = { type: "wall" | "opening" | "room"; id: string } | null;
type VB = { x: number; y: number; w: number };

const KIND_STYLE: Record<WallKind, { stroke: string; dash?: string; label: string }> = {
  full: { stroke: "rgba(196,106,60,0.78)", label: "Full wall" },
  half: { stroke: "rgba(79,134,166,0.85)", dash: "0.25 0.12", label: "Half wall" },
  glass: { stroke: "rgba(42,167,184,0.9)", label: "Glass" },
  railing: { stroke: "rgba(107,142,35,0.9)", dash: "0.12 0.1", label: "Railing" },
};
const OP_STYLE: Record<OpeningType, { color: string; label: string }> = {
  door: { color: "#7a4a2a", label: "Door" },
  opening: { color: "#a07850", label: "Archway / open" },
  sliding: { color: "#2a7fa0", label: "Sliding door" },
  window: { color: "#2a7fa0", label: "Window" },
};
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "select", label: "Select", hint: "Click a wall, door or room to change it. Drag to move. Drag empty space to pan, scroll to zoom." },
  { id: "wall", label: "Wall", hint: "Click to start a wall, click again to end it (keeps going for the next wall). Double-click or Esc to stop." },
  { id: "door", label: "Door", hint: "Click on a wall to add a door." },
  { id: "window", label: "Window", hint: "Click on a wall to add a window." },
  { id: "opening", label: "Archway", hint: "Click on a wall to add an open archway (no door shutter)." },
  { id: "sliding", label: "Sliding", hint: "Click on a wall to add a sliding door." },
  { id: "room", label: "Room", hint: "Drag a rectangle over a room's floor, then name it." },
  { id: "scale", label: "Scale", hint: "Click both ends of a dimension you know (e.g. a wall marked 12'6\"), then type its real length." },
];

/** Parses 12'6", 12' 6, 3.8, 3.8m, 380cm, 3800mm into metres. */
export function parseLength(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, " ");
  const ft = t.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches|'')?)?$/);
  if (ft) return +ft[1] * 0.3048 + (ft[2] ? +ft[2] * 0.0254 : 0);
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/);
  if (m) {
    const v = +m[1];
    if (m[2] === "mm" || (!m[2] && v > 200)) return v / 1000;
    if (m[2] === "cm") return v / 100;
    return v;
  }
  return null;
}
const fmtLen = (m: number) => {
  const inches = Math.round(m / 0.0254);
  return `${m.toFixed(2)} m · ${Math.floor(inches / 12)}'${inches % 12}"`;
};

export default function PlanEditor({ initial, onSave, saving }: { initial: HomeScene; onSave: (s: HomeScene, build: boolean) => Promise<void>; saving: boolean }) {
  const [scene, setScene] = useState<HomeScene>(initial);
  const [past, setPast] = useState<HomeScene[]>([]);
  const [future, setFuture] = useState<HomeScene[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<Sel>(null);
  const [newKind, setNewKind] = useState<WallKind>("full");
  const [opacity, setOpacity] = useState(0.55);
  const [dirty, setDirty] = useState(false);
  const [hover, setHover] = useState<Pt | null>(null);
  const [chain, setChain] = useState<Pt | null>(null);
  const [scalePts, setScalePts] = useState<Pt[]>([]);
  const [scaleInput, setScaleInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [drawRect, setDrawRect] = useState<{ a: Pt; b: Pt } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // ---------- view ----------
  const fitBox = useCallback(() => {
    const b = scene.underlay ? { x0: 0, y0: 0, x1: scene.underlay.w, y1: scene.underlay.h } : sceneBox(scene);
    const bw = b.x1 - b.x0,
      bh = b.y1 - b.y0;
    const aspect = size.h / size.w;
    const w = Math.max(bw, bh / aspect) * 1.08;
    return { x: b.x0 - (w - bw) / 2, y: b.y0 - (w * aspect - bh) / 2, w };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);
  const [vb, setVb] = useState<VB>({ x: 0, y: 0, w: 20 });
  const fitted = useRef(false);
  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!fitted.current && size.w > 100) {
      setVb(fitBox());
      fitted.current = true;
    }
  }, [size, fitBox]);
  const vh = vb.w * (size.h / size.w);
  const pxm = size.w / vb.w; // pixels per metre
  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const r = svgRef.current!.getBoundingClientRect();
      return [vb.x + ((cx - r.left) / r.width) * vb.w, vb.y + ((cy - r.top) / r.height) * vh];
    },
    [vb, vh],
  );

  // ---------- history ----------
  const commit = useCallback(
    (next: HomeScene, from?: HomeScene) => {
      setPast((p) => [...p.slice(-60), from ?? scene]);
      setFuture([]);
      setScene(next);
      setDirty(true);
    },
    [scene],
  );
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [scene, ...f]);
    setScene(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setDirty(true);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, scene]);
    setScene(future[0]);
    setFuture((f) => f.slice(1));
    setDirty(true);
  };

  // ---------- auto-snap on first open ----------
  const runSnap = useCallback(
    (base: HomeScene, silent = false) => {
      const img = imgRef.current;
      if (!img || !img.complete || !img.naturalWidth) return;
      try {
        const { scene: s2, moved } = snapToPlan(base, img);
        commit(s2, base);
        if (!silent) setMsg(moved ? `Lined up ${moved} walls with the plan.` : "Walls already match the plan lines.");
      } catch {
        setMsg("Couldn't read the plan picture for lining up.");
      }
    },
    [commit],
  );
  useEffect(() => {
    if (!scene.underlay || scene.snapped) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      runSnap(scene, false);
    };
    img.src = scene.underlay.url;
    // first open only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!scene.underlay || imgRef.current) return;
    const img = new Image();
    img.onload = () => (imgRef.current = img);
    img.src = scene.underlay.url;
  }, [scene.underlay]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ---------- lookups and snapping ----------
  const wallById = useMemo(() => new Map(scene.walls.map((w) => [w.id, w])), [scene.walls]);
  const tolM = 14 / pxm;
  const snapPoint = useCallback(
    (p: Pt, skipWall?: string, from?: Pt | null): Pt => {
      for (const w of scene.walls) {
        if (w.id === skipWall) continue;
        for (const q of [w.a, w.b]) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < tolM) return [q[0], q[1]];
      }
      let out: Pt = [p[0], p[1]];
      if (from) {
        const dx = p[0] - from[0],
          dy = p[1] - from[1];
        const ang = Math.atan2(Math.abs(dy), Math.abs(dx));
        if (ang < 0.14) out = [p[0], from[1]];
        else if (ang > Math.PI / 2 - 0.14) out = [from[0], p[1]];
      }
      for (const w of scene.walls) {
        if (w.id === skipWall) continue;
        const pr = project(w, out);
        if (pr.inside && pr.dist < tolM * 0.7) {
          const ax = axisOf(w);
          if (ax === "h") out = [out[0], w.a[1]];
          else if (ax === "v") out = [w.a[0], out[1]];
          else out = along(w, pr.at);
          break;
        }
      }
      return [Math.round(out[0] * 100) / 100, Math.round(out[1] * 100) / 100];
    },
    [scene.walls, tolM],
  );
  const nearestWall = useCallback(
    (p: Pt) => {
      let best: { w: Wall; at: number } | null = null,
        bd = Math.max(0.4, 18 / pxm);
      for (const w of scene.walls) {
        const pr = project(w, p);
        if (pr.inside && pr.dist < bd) (bd = pr.dist), (best = { w, at: pr.at });
      }
      return best;
    },
    [scene.walls, pxm],
  );

  // ---------- editing helpers ----------
  const update = (fn: (s: HomeScene) => HomeScene) => commit(fn(scene));
  const setWall = (id: string, patch: Partial<Wall>) => update((s) => ({ ...s, walls: s.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  const setOpening = (id: string, patch: Partial<WallOpening>) => update((s) => ({ ...s, openings: s.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const setRoom = (id: string, patch: Partial<SceneRoom>) => update((s) => ({ ...s, rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeSel = () => {
    if (!sel) return;
    if (sel.type === "wall") update((s) => ({ ...s, walls: s.walls.filter((w) => w.id !== sel.id), openings: s.openings.filter((o) => o.wall !== sel.id) }));
    if (sel.type === "opening") update((s) => ({ ...s, openings: s.openings.filter((o) => o.id !== sel.id) }));
    if (sel.type === "room") update((s) => ({ ...s, rooms: s.rooms.filter((r) => r.id !== sel.id) }));
    setSel(null);
  };
  const splitWall = (id: string) => {
    const w = wallById.get(id);
    if (!w) return;
    const L = wallLen(w);
    const mid = along(w, L / 2);
    const w2: Wall = { ...w, id: newId("w"), a: mid, b: w.b };
    update((s) => ({
      ...s,
      walls: s.walls.flatMap((x) => (x.id === id ? [{ ...x, b: mid }, w2] : [x])),
      openings: s.openings.map((o) => (o.wall === id && o.at > L / 2 ? { ...o, wall: w2.id, at: o.at - L / 2 } : o)),
    }));
    setMsg("Wall split in two — now you can change or remove one half.");
  };

  // ---------- pointer handling ----------
  type Drag =
    | { kind: "pan"; sx: number; sy: number; vb: VB }
    | { kind: "wall"; id: string; start: Pt; orig: Wall; base: HomeScene }
    | { kind: "end"; id: string; end: "a" | "b"; base: HomeScene }
    | { kind: "opening"; id: string; base: HomeScene }
    | { kind: "room"; id: string; start: Pt; orig: SceneRoom; base: HomeScene }
    | { kind: "corner"; id: string; corner: number; orig: SceneRoom; base: HomeScene }
    | { kind: "draw"; start: Pt };
  const drag = useRef<Drag | null>(null);
  const moved = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; vb: VB; mid: Pt } | null>(null);

  const onDown = (e: React.PointerEvent, target?: { type: "wall" | "opening" | "room" | "end" | "corner"; id: string; extra?: string | number }) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), vb, mid: toWorld((p1.x + p2.x) / 2, (p1.y + p2.y) / 2) };
      drag.current = null;
      return;
    }
    moved.current = false;
    const p = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vb };
      return;
    }
    if (tool === "select") {
      if (target?.type === "end") drag.current = { kind: "end", id: target.id, end: target.extra as "a" | "b", base: scene };
      else if (target?.type === "corner") {
        const r = scene.rooms.find((x) => x.id === target.id)!;
        drag.current = { kind: "corner", id: target.id, corner: target.extra as number, orig: r, base: scene };
      } else if (target?.type === "wall") {
        setSel({ type: "wall", id: target.id });
        drag.current = { kind: "wall", id: target.id, start: p, orig: wallById.get(target.id)!, base: scene };
      } else if (target?.type === "opening") {
        setSel({ type: "opening", id: target.id });
        drag.current = { kind: "opening", id: target.id, base: scene };
      } else if (target?.type === "room") {
        setSel({ type: "room", id: target.id });
        drag.current = { kind: "room", id: target.id, start: p, orig: scene.rooms.find((r) => r.id === target.id)!, base: scene };
      } else {
        setSel(null);
        drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vb };
      }
      return;
    }
    if (tool === "room") drag.current = { kind: "draw", start: snapPoint(p) };
    else drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vb };
  };

  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const k = pinch.current.d / Math.max(10, d);
      const nw = Math.min(200, Math.max(2, pinch.current.vb.w * k));
      const { mid, vb: v0 } = pinch.current;
      const fx = (mid[0] - v0.x) / v0.w,
        fy = (mid[1] - v0.y) / (v0.w * (size.h / size.w));
      setVb({ x: mid[0] - fx * nw, y: mid[1] - fy * nw * (size.h / size.w), w: nw });
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    const D = drag.current;
    if (!D) {
      if (tool === "wall") setHover(snapPoint(p, undefined, chain));
      else if (tool === "scale") setHover(snapPoint(p));
      else setHover(p);
      return;
    }
    moved.current = true;
    if (D.kind === "pan") {
      const r = svgRef.current!.getBoundingClientRect();
      const k = D.vb.w / r.width;
      setVb({ ...D.vb, x: D.vb.x - (e.clientX - D.sx) * k, y: D.vb.y - (e.clientY - D.sy) * k });
    } else if (D.kind === "wall") {
      const dx = p[0] - D.start[0],
        dy = p[1] - D.start[1];
      const ax = axisOf(D.orig);
      const mx = ax === "h" ? 0 : dx,
        my = ax === "v" ? 0 : dy; // straight walls slide sideways
      const r = (n: number) => Math.round(n * 100) / 100;
      setScene({ ...D.base, walls: D.base.walls.map((w) => (w.id === D.id ? { ...w, a: [r(D.orig.a[0] + mx), r(D.orig.a[1] + my)], b: [r(D.orig.b[0] + mx), r(D.orig.b[1] + my)] } : w)) });
    } else if (D.kind === "end") {
      const w = D.base.walls.find((x) => x.id === D.id)!;
      const other = D.end === "a" ? w.b : w.a;
      const q = snapPoint(p, D.id, other);
      setScene({ ...D.base, walls: D.base.walls.map((x) => (x.id === D.id ? { ...x, [D.end]: q } : x)) });
    } else if (D.kind === "opening") {
      const o = D.base.openings.find((x) => x.id === D.id)!;
      const w = wallById.get(o.wall);
      if (!w) return;
      const L = wallLen(w);
      const at = Math.min(L - o.width / 2, Math.max(o.width / 2, project(w, p).at));
      setScene({ ...D.base, openings: D.base.openings.map((x) => (x.id === D.id ? { ...x, at: Math.round(at * 100) / 100 } : x)) });
    } else if (D.kind === "room") {
      const r = (n: number) => Math.round(n * 100) / 100;
      setScene({ ...D.base, rooms: D.base.rooms.map((x) => (x.id === D.id ? { ...x, x: r(D.orig.x + p[0] - D.start[0]), y: r(D.orig.y + p[1] - D.start[1]) } : x)) });
    } else if (D.kind === "corner") {
      const q = snapPoint(p);
      const o = D.orig;
      let x0 = o.x,
        y0 = o.y,
        x1 = o.x + o.w,
        y1 = o.y + o.d;
      if (D.corner === 0 || D.corner === 3) x0 = q[0];
      else x1 = q[0];
      if (D.corner === 0 || D.corner === 1) y0 = q[1];
      else y1 = q[1];
      setScene({ ...D.base, rooms: D.base.rooms.map((x) => (x.id === D.id ? { ...x, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), d: Math.abs(y1 - y0) } : x)) });
    } else if (D.kind === "draw") {
      setDrawRect({ a: D.start, b: snapPoint(p) });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const D = drag.current;
    drag.current = null;
    const p = toWorld(e.clientX, e.clientY);
    if (D && "base" in D && moved.current) {
      setPast((ps) => [...ps.slice(-60), D.base]);
      setFuture([]);
      setDirty(true);
      return;
    }
    if (D?.kind === "draw") {
      setDrawRect(null);
      const b = snapPoint(p);
      const w = Math.abs(b[0] - D.start[0]),
        d = Math.abs(b[1] - D.start[1]);
      if (w >= 0.5 && d >= 0.5) {
        const room: SceneRoom = { id: newId("r"), name: `Room ${scene.rooms.length + 1}`, type: "other", x: Math.min(b[0], D.start[0]), y: Math.min(b[1], D.start[1]), w, d };
        update((s) => ({ ...s, rooms: [...s.rooms, room] }));
        setSel({ type: "room", id: room.id });
        setTool("select");
      }
      return;
    }
    if (moved.current && D?.kind === "pan") return;
    // Clicks for the drawing tools.
    if (tool === "wall") {
      const q = snapPoint(p, undefined, chain);
      if (!chain) setChain(q);
      else if (Math.hypot(q[0] - chain[0], q[1] - chain[1]) < 0.1) setChain(null);
      else {
        const wall: Wall = { id: newId("w"), a: chain, b: q, kind: newKind, t: newKind === "full" ? DEFAULT_T.interior : DEFAULT_T[newKind] };
        update((s) => ({ ...s, walls: [...s.walls, wall] }));
        setChain(q);
      }
    } else if (tool === "door" || tool === "window" || tool === "opening" || tool === "sliding") {
      const nw = nearestWall(p);
      if (!nw) return setMsg("Click right on a wall to add it.");
      const L = wallLen(nw.w);
      const width = Math.min(OPENING_WIDTH[tool], L - 0.1);
      if (width < 0.3) return setMsg("That wall is too short.");
      const op: WallOpening = { id: newId("o"), wall: nw.w.id, at: Math.min(L - width / 2, Math.max(width / 2, nw.at)), width, type: tool };
      update((s) => ({ ...s, openings: [...s.openings, op] }));
      setSel({ type: "opening", id: op.id });
    } else if (tool === "scale") {
      const q = snapPoint(p);
      setScalePts((pts) => (pts.length >= 2 ? [q] : [...pts, q]));
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = toWorld(e.clientX, e.clientY);
    const k = Math.exp(e.deltaY * 0.0015);
    const nw = Math.min(200, Math.max(2, vb.w * k));
    const fx = (p[0] - vb.x) / vb.w,
      fy = (p[1] - vb.y) / vh;
    setVb({ x: p[0] - fx * nw, y: p[1] - fy * nw * (size.h / size.w), w: nw });
  };
  useEffect(() => {
    const el = svgRef.current!;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        removeSel();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "Escape") {
        setChain(null);
        setScalePts([]);
        setSel(null);
        setDrawRect(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const applyScale = () => {
    if (scalePts.length !== 2) return;
    const real = parseLength(scaleInput);
    const measured = Math.hypot(scalePts[1][0] - scalePts[0][0], scalePts[1][1] - scalePts[0][1]);
    if (!real || measured < 0.05) return setMsg("Type the real length, e.g. 12'6\" or 3.8 m.");
    const k = real / measured;
    const S = (p: Pt): Pt => [Math.round(p[0] * k * 1000) / 1000, Math.round(p[1] * k * 1000) / 1000];
    update((s) => {
      const next: HomeScene = {
        ...s,
        walls: s.walls.map((w) => ({ ...w, a: S(w.a), b: S(w.b) })),
        openings: s.openings.map((o) => ({ ...o, at: o.at * k })),
        rooms: s.rooms.map((r) => ({ ...r, x: r.x * k, y: r.y * k, w: r.w * k, d: r.d * k })),
        underlay: s.underlay ? { ...s.underlay, w: s.underlay.w * k, h: s.underlay.h * k } : undefined,
      };
      return { ...next, box: sceneBox(next) };
    });
    setVb((v) => ({ x: v.x * k, y: v.y * k, w: v.w * k }));
    setScalePts([]);
    setScaleInput("");
    setTool("select");
    setMsg(`Scale set — everything is now ${k > 1 ? "larger" : "smaller"} by ${Math.abs((k - 1) * 100).toFixed(1)}%.`);
  };

  // ---------- derived ----------
  const selWall = sel?.type === "wall" ? wallById.get(sel.id) : undefined;
  const selOp = sel?.type === "opening" ? scene.openings.find((o) => o.id === sel.id) : undefined;
  const selRoom = sel?.type === "room" ? scene.rooms.find((r) => r.id === sel.id) : undefined;
  const warnings: string[] = [];
  if (!scene.openings.some((o) => o.main)) warnings.push("No main entrance marked — select the entrance door and tick “Main entrance”.");
  if (!scene.rooms.length) warnings.push("No rooms yet — use Room to mark floors.");
  const unnamed = scene.rooms.filter((r) => /^Room \d+$/.test(r.name)).length;
  if (unnamed) warnings.push(`${unnamed} room${unnamed > 1 ? "s" : ""} still need a name.`);
  const sw = (px: number) => px / pxm; // screen pixels → metres

  const save = async (build: boolean) => {
    const out = alignRooms({ ...scene, box: sceneBox(scene) }, 0.2);
    await onSave(out, build);
    setDirty(false);
  };

  // ---------- render ----------
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTool(t.id);
                setChain(null);
                setScalePts([]);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${tool === t.id ? "bg-ink text-white" : "bg-paper text-ink ring-1 ring-line hover:bg-brass-soft"}`}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" onClick={undo} disabled={!past.length} className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold ring-1 ring-line disabled:opacity-40" title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button type="button" onClick={redo} disabled={!future.length} className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold ring-1 ring-line disabled:opacity-40" title="Redo (Ctrl+Shift+Z)">
            ↷
          </button>
        </div>
        <p className="text-xs text-muted">
          {TOOLS.find((t) => t.id === tool)?.hint}
          {tool === "wall" && (
            <span className="ml-2 inline-flex gap-1">
              {(Object.keys(KIND_STYLE) as WallKind[]).map((k) => (
                <button key={k} type="button" onClick={() => setNewKind(k)} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${newKind === k ? "bg-brass text-white" : "bg-paper ring-1 ring-line"}`}>
                  {KIND_STYLE[k].label}
                </button>
              ))}
            </span>
          )}
        </p>
        <div className="relative overflow-hidden rounded-2xl border border-line bg-white" style={{ height: "min(72vh, 720px)" }}>
          <svg
            ref={svgRef}
            className="absolute inset-0 h-full w-full touch-none select-none"
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vh}`}
            onPointerDown={(e) => onDown(e)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onWheel={onWheel}
            onDoubleClick={() => setChain(null)}
            style={{ cursor: tool === "select" ? "default" : "crosshair" }}
          >
            {scene.underlay && <image href={scene.underlay.url} x={0} y={0} width={scene.underlay.w} height={scene.underlay.h} opacity={opacity} preserveAspectRatio="none" />}
            {/* rooms */}
            {scene.rooms.map((r) => {
              const on = sel?.type === "room" && sel.id === r.id;
              return (
                <g key={r.id}>
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.d}
                    fill={on ? "rgba(201,150,46,0.22)" : "rgba(201,167,124,0.13)"}
                    stroke={on ? "#c9962e" : "rgba(160,120,80,0.55)"}
                    strokeWidth={sw(on ? 2 : 1)}
                    strokeDasharray={`${sw(6)} ${sw(4)}`}
                    onPointerDown={(e) => {
                      if (tool !== "select") return;
                      e.stopPropagation();
                      onDown(e, { type: "room", id: r.id });
                    }}
                  />
                  <text x={r.x + r.w / 2} y={r.y + r.d / 2 + sw(22)} textAnchor="middle" fontSize={sw(12)} fontWeight={700} fill="#8a4a1e" stroke="#fff" strokeWidth={sw(3)} paintOrder="stroke" pointerEvents="none">
                    {r.name}
                  </text>
                  <text x={r.x + r.w / 2} y={r.y + r.d / 2 + sw(36)} textAnchor="middle" fontSize={sw(10)} fill="#8a4a1e" stroke="#fff" strokeWidth={sw(3)} paintOrder="stroke" pointerEvents="none">
                    {r.w.toFixed(2)} × {r.d.toFixed(2)} m
                  </text>
                </g>
              );
            })}
            {/* walls */}
            {scene.walls.map((w) => {
              const st = KIND_STYLE[w.kind];
              const on = sel?.type === "wall" && sel.id === w.id;
              return (
                <g key={w.id}>
                  <line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke={on ? "#1d1d1d" : st.stroke} strokeWidth={Math.max(w.t, sw(3))} strokeDasharray={st.dash} strokeLinecap="square" pointerEvents="none" />
                  <line
                    x1={w.a[0]}
                    y1={w.a[1]}
                    x2={w.b[0]}
                    y2={w.b[1]}
                    stroke="transparent"
                    strokeWidth={Math.max(w.t, sw(14))}
                    data-wall={w.id}
                    onPointerDown={(e) => {
                      if (tool !== "select") return;
                      e.stopPropagation();
                      onDown(e, { type: "wall", id: w.id });
                    }}
                    style={{ cursor: tool === "select" ? "move" : undefined }}
                  />
                </g>
              );
            })}
            {/* openings */}
            {scene.openings.map((o) => {
              const w = wallById.get(o.wall);
              if (!w) return null;
              const L = wallLen(w) || 1;
              const ux = (w.b[0] - w.a[0]) / L,
                uy = (w.b[1] - w.a[1]) / L;
              const nx = -uy * (o.flip ? -1 : 1),
                ny = ux * (o.flip ? -1 : 1);
              const p0 = along(w, o.at - o.width / 2),
                p1 = along(w, o.at + o.width / 2);
              const on = sel?.type === "opening" && sel.id === o.id;
              const st = OP_STYLE[o.type];
              return (
                <g
                  key={o.id}
                  onPointerDown={(e) => {
                    if (tool !== "select") return;
                    e.stopPropagation();
                    onDown(e, { type: "opening", id: o.id });
                  }}
                  style={{ cursor: tool === "select" ? "ew-resize" : undefined }}
                >
                  <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke="#fff" strokeWidth={w.t + 0.03} />
                  {o.type === "door" && (
                    <path
                      d={`M ${p0[0]} ${p0[1]} L ${p0[0] + nx * o.width} ${p0[1] + ny * o.width} A ${o.width} ${o.width} 0 0 ${o.flip ? 0 : 1} ${p1[0]} ${p1[1]}`}
                      fill="rgba(122,74,42,0.08)"
                      stroke={on ? "#1d1d1d" : st.color}
                      strokeWidth={sw(on ? 2.5 : 1.5)}
                    />
                  )}
                  {o.type === "window" && (
                    <>
                      <line x1={p0[0] + nx * 0.04} y1={p0[1] + ny * 0.04} x2={p1[0] + nx * 0.04} y2={p1[1] + ny * 0.04} stroke={on ? "#1d1d1d" : st.color} strokeWidth={sw(on ? 2.5 : 1.8)} />
                      <line x1={p0[0] - nx * 0.04} y1={p0[1] - ny * 0.04} x2={p1[0] - nx * 0.04} y2={p1[1] - ny * 0.04} stroke={on ? "#1d1d1d" : st.color} strokeWidth={sw(on ? 2.5 : 1.8)} />
                    </>
                  )}
                  {o.type === "sliding" && (
                    <>
                      <line x1={p0[0] + nx * 0.03} y1={p0[1] + ny * 0.03} x2={along(w, o.at + 0.1)[0] + nx * 0.03} y2={along(w, o.at + 0.1)[1] + ny * 0.03} stroke={on ? "#1d1d1d" : st.color} strokeWidth={sw(3)} />
                      <line x1={along(w, o.at - 0.1)[0] - nx * 0.03} y1={along(w, o.at - 0.1)[1] - ny * 0.03} x2={p1[0] - nx * 0.03} y2={p1[1] - ny * 0.03} stroke={on ? "#1d1d1d" : st.color} strokeWidth={sw(3)} />
                    </>
                  )}
                  {o.type === "opening" && <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke={on ? "#1d1d1d" : st.color} strokeWidth={sw(2)} strokeDasharray={`${sw(4)} ${sw(3)}`} />}
                  {o.main && <circle cx={(p0[0] + p1[0]) / 2} cy={(p0[1] + p1[1]) / 2} r={sw(7)} fill="#c9962e" stroke="#fff" strokeWidth={sw(1.5)} />}
                  {/* fat hit area */}
                  <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke="transparent" strokeWidth={Math.max(w.t + 0.1, sw(16))} />
                </g>
              );
            })}
            {/* selected wall handles */}
            {selWall &&
              tool === "select" &&
              (["a", "b"] as const).map((end) => (
                <circle
                  key={end}
                  cx={selWall[end][0]}
                  cy={selWall[end][1]}
                  r={sw(8)}
                  fill="#fff"
                  stroke="#1d1d1d"
                  strokeWidth={sw(2)}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onDown(e, { type: "end", id: selWall.id, extra: end });
                  }}
                />
              ))}
            {selRoom &&
              tool === "select" &&
              [
                [selRoom.x, selRoom.y],
                [selRoom.x + selRoom.w, selRoom.y],
                [selRoom.x + selRoom.w, selRoom.y + selRoom.d],
                [selRoom.x, selRoom.y + selRoom.d],
              ].map(([x, y], i) => (
                <rect
                  key={i}
                  x={x - sw(6)}
                  y={y - sw(6)}
                  width={sw(12)}
                  height={sw(12)}
                  fill="#fff"
                  stroke="#c9962e"
                  strokeWidth={sw(2)}
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onDown(e, { type: "corner", id: selRoom.id, extra: i });
                  }}
                />
              ))}
            {/* drawing previews */}
            {tool === "wall" && chain && hover && <line x1={chain[0]} y1={chain[1]} x2={hover[0]} y2={hover[1]} stroke="#1d1d1d" strokeWidth={sw(3)} strokeDasharray={`${sw(6)} ${sw(4)}`} pointerEvents="none" />}
            {tool === "wall" && chain && hover && (
              <text x={(chain[0] + hover[0]) / 2} y={(chain[1] + hover[1]) / 2 - sw(8)} fontSize={sw(12)} textAnchor="middle" fill="#1d1d1d" fontWeight={700} pointerEvents="none">
                {Math.hypot(hover[0] - chain[0], hover[1] - chain[1]).toFixed(2)} m
              </text>
            )}
            {(tool === "wall" || tool === "scale") && hover && <circle cx={hover[0]} cy={hover[1]} r={sw(5)} fill="#c9962e" pointerEvents="none" />}
            {drawRect && (
              <rect
                x={Math.min(drawRect.a[0], drawRect.b[0])}
                y={Math.min(drawRect.a[1], drawRect.b[1])}
                width={Math.abs(drawRect.b[0] - drawRect.a[0])}
                height={Math.abs(drawRect.b[1] - drawRect.a[1])}
                fill="rgba(201,150,46,0.15)"
                stroke="#c9962e"
                strokeWidth={sw(2)}
                pointerEvents="none"
              />
            )}
            {scalePts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={sw(6)} fill="#2a7fa0" pointerEvents="none" />
            ))}
            {scalePts.length === 2 && <line x1={scalePts[0][0]} y1={scalePts[0][1]} x2={scalePts[1][0]} y2={scalePts[1][1]} stroke="#2a7fa0" strokeWidth={sw(3)} pointerEvents="none" />}
          </svg>
          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
            {(Object.keys(KIND_STYLE) as WallKind[]).map((k) => (
              <span key={k} className="rounded-full bg-paper/90 px-2 py-0.5 shadow" style={{ color: KIND_STYLE[k].stroke }}>
                ━ {KIND_STYLE[k].label}
              </span>
            ))}
          </div>
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            <button type="button" onClick={() => setVb((v) => ({ ...v, w: v.w / 1.3, x: v.x + (v.w - v.w / 1.3) / 2, y: v.y + (vh - vh / 1.3) / 2 }))} className="h-8 w-8 rounded-full bg-paper text-sm font-bold shadow">
              +
            </button>
            <button type="button" onClick={() => setVb((v) => ({ ...v, w: v.w * 1.3, x: v.x - (v.w * 0.3) / 2, y: v.y - (vh * 0.3) / 2 }))} className="h-8 w-8 rounded-full bg-paper text-sm font-bold shadow">
              −
            </button>
            <button type="button" onClick={() => setVb(fitBox())} className="h-8 rounded-full bg-paper px-3 text-xs font-semibold shadow">
              Fit
            </button>
          </div>
        </div>
        {msg && (
          <p className="rounded-lg bg-brass-soft px-3 py-1.5 text-xs text-ink" onClick={() => setMsg(null)}>
            {msg}
          </p>
        )}
      </div>

      {/* side panel */}
      <aside className="grid content-start gap-3">
        <div className="rounded-xl border border-line bg-paper p-3">
          {tool === "scale" ? (
            <div className="grid gap-2 text-sm">
              <p className="font-semibold">Set the scale</p>
              <p className="text-xs text-muted">{scalePts.length < 2 ? `Click ${scalePts.length ? "the other end" : "one end"} of a dimension you know.` : `Measured ${fmtLen(Math.hypot(scalePts[1][0] - scalePts[0][0], scalePts[1][1] - scalePts[0][1]))}. Real length:`}</p>
              {scalePts.length === 2 && (
                <div className="flex gap-2">
                  <input autoFocus value={scaleInput} onChange={(e) => setScaleInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyScale()} placeholder={`12'6" or 3.8 m`} className="input" />
                  <button type="button" onClick={applyScale} className="btn-brass px-3 text-xs">
                    Apply
                  </button>
                </div>
              )}
            </div>
          ) : selWall ? (
            <div className="grid gap-2 text-sm">
              <p className="font-semibold">Wall · {wallLen(selWall).toFixed(2)} m</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(KIND_STYLE) as WallKind[]).map((k) => (
                  <button key={k} type="button" onClick={() => setWall(selWall.id, { kind: k, t: k === "full" ? Math.max(selWall.t, DEFAULT_T.interior) : DEFAULT_T[k] })} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${selWall.kind === k ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>
                    {KIND_STYLE[k].label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={removeSel} className="rounded-lg bg-clay-soft px-2 py-1.5 text-xs font-semibold text-clay">
                Remove wall (make it open)
              </button>
              <button type="button" onClick={() => splitWall(selWall.id)} className="rounded-lg bg-white px-2 py-1.5 text-xs font-semibold ring-1 ring-line">
                Split in two
              </button>
              <label className="grid gap-1 text-xs text-muted">
                Thickness (cm)
                <input type="number" min={4} max={50} value={Math.round(selWall.t * 100)} onChange={(e) => setWall(selWall.id, { t: Math.min(0.5, Math.max(0.04, +e.target.value / 100)) })} className="input" />
              </label>
              <label className="grid gap-1 text-xs text-muted">
                Length
                <input
                  key={selWall.id + wallLen(selWall).toFixed(2)}
                  defaultValue={wallLen(selWall).toFixed(2)}
                  onBlur={(e) => {
                    const v = parseLength(e.target.value);
                    if (!v || v < 0.1) return;
                    const L = wallLen(selWall);
                    setWall(selWall.id, { b: [Math.round((selWall.a[0] + ((selWall.b[0] - selWall.a[0]) * v) / L) * 1000) / 1000, Math.round((selWall.a[1] + ((selWall.b[1] - selWall.a[1]) * v) / L) * 1000) / 1000] });
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="input"
                />
              </label>
              <p className="text-[11px] text-muted">Drag the wall to move it, or the white dots to change its ends. Delete key removes it.</p>
            </div>
          ) : selOp ? (
            <div className="grid gap-2 text-sm">
              <p className="font-semibold">{OP_STYLE[selOp.type].label}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(OP_STYLE) as OpeningType[]).map((k) => (
                  <button key={k} type="button" onClick={() => setOpening(selOp.id, { type: k, ...(k === "window" ? { main: false } : {}) })} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${selOp.type === k ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>
                    {OP_STYLE[k].label}
                  </button>
                ))}
              </div>
              <label className="grid gap-1 text-xs text-muted">
                Width (cm)
                <input type="number" min={30} max={600} value={Math.round(selOp.width * 100)} onChange={(e) => setOpening(selOp.id, { width: Math.max(0.3, +e.target.value / 100) })} className="input" />
              </label>
              {selOp.type !== "window" && (
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={!!selOp.main} onChange={(e) => update((s) => ({ ...s, openings: s.openings.map((o) => ({ ...o, main: o.id === selOp.id ? e.target.checked : e.target.checked ? false : o.main })) }))} />
                  Main entrance
                </label>
              )}
              {selOp.type === "door" && (
                <button type="button" onClick={() => setOpening(selOp.id, { flip: !selOp.flip })} className="rounded-lg bg-white px-2 py-1.5 text-xs font-semibold ring-1 ring-line">
                  Flip swing side
                </button>
              )}
              <button type="button" onClick={removeSel} className="rounded-lg bg-clay-soft px-2 py-1.5 text-xs font-semibold text-clay">
                Remove
              </button>
              <p className="text-[11px] text-muted">Drag it along the wall to move it.</p>
            </div>
          ) : selRoom ? (
            <div className="grid gap-2 text-sm">
              <p className="font-semibold">Room</p>
              <label className="grid gap-1 text-xs text-muted">
                Name
                <input key={selRoom.id} defaultValue={selRoom.name} onBlur={(e) => e.target.value.trim() && e.target.value !== selRoom.name && setRoom(selRoom.id, { name: e.target.value.trim().slice(0, 40) })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="input" />
              </label>
              <label className="grid gap-1 text-xs text-muted">
                Type (decides the furniture)
                <select value={selRoom.type} onChange={(e) => setRoom(selRoom.id, { type: e.target.value as RoomType })} className="input">
                  {ROOM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ROOM_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted">
                {selRoom.w.toFixed(2)} × {selRoom.d.toFixed(2)} m · {fmtLen(selRoom.w).split("·")[1]} × {fmtLen(selRoom.d).split("·")[1]}
              </p>
              <button type="button" onClick={removeSel} className="rounded-lg bg-clay-soft px-2 py-1.5 text-xs font-semibold text-clay">
                Remove room
              </button>
              <p className="text-[11px] text-muted">Drag to move, drag the corners to resize.</p>
            </div>
          ) : (
            <div className="grid gap-2 text-sm">
              <p className="font-semibold">Check against your plan</p>
              <ul className="grid gap-1 text-xs text-muted">
                <li>• Every drawn wall has a coloured line on it</li>
                <li>• Open areas have no line — select it and “Remove wall”</li>
                <li>• Doors, archways and windows are in the right places</li>
                <li>• Rooms are named with the right type</li>
              </ul>
              <p className="text-xs text-muted">
                {scene.walls.length} walls · {scene.openings.length} doors &amp; windows · {scene.rooms.length} rooms
              </p>
            </div>
          )}
        </div>

        {warnings.length > 0 && (
          <ul className="grid gap-1 rounded-xl bg-clay-soft p-3 text-xs text-clay">
            {warnings.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        )}

        {scene.underlay && (
          <div className="grid gap-2 rounded-xl border border-line bg-paper p-3 text-xs">
            <label className="grid gap-1 font-semibold">
              Plan picture
              <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
            </label>
            <button type="button" onClick={() => runSnap(scene)} className="rounded-lg bg-white px-2 py-1.5 font-semibold ring-1 ring-line hover:bg-brass-soft">
              Line walls up with the plan
            </button>
          </div>
        )}

        <div className="grid gap-2">
          <button type="button" disabled={saving} onClick={() => save(true)} className="btn-primary">
            {saving ? "Saving…" : "Save & build 3D →"}
          </button>
          <button type="button" disabled={saving || !dirty} onClick={() => save(false)} className="btn-ghost text-xs">
            {dirty ? "Save without building" : "All changes saved"}
          </button>
        </div>
      </aside>
    </div>
  );
}
