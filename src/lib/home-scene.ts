/**
 * The 3D home made from a floor plan. Shared by the server (plan reader) and the browser (3D viewer).
 * Units are metres. x runs left→right on the plan, y runs top→bottom.
 * Rooms are axis-aligned rectangles (an L-shaped room is two rectangles with the same name).
 * Walls are not stored: they're worked out from the room edges, so they always line up.
 */

export const ROOM_TYPES = [
  "living",
  "dining",
  "living_dining",
  "kitchen",
  "master_bedroom",
  "bedroom",
  "kids_bedroom",
  "guest_bedroom",
  "bathroom",
  "powder",
  "balcony",
  "foyer",
  "passage",
  "study",
  "puja",
  "utility",
  "store",
  "other",
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const INTERIOR_STYLES = ["modern", "luxury", "japandi", "minimalist", "scandinavian", "traditional", "industrial", "coastal"] as const;
export type InteriorStyle = (typeof INTERIOR_STYLES)[number];

export type SceneRoom = { name: string; type: RoomType; x: number; y: number; w: number; d: number };
export type Opening = { x: number; y: number; width: number; dir: "h" | "v"; main?: boolean };
export type HomeScene = {
  v: 1;
  width: number;
  depth: number;
  rooms: SceneRoom[];
  doors: Opening[];
  windows: Opening[];
  notes: string[];
};

export const WALL_H = 2.9;
export const DOOR_H = 2.15;
export const SILL_H = 0.9;
export const HEAD_H = 2.2;

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v));

/** Pulls nearby values together so rooms that should share an edge really do. */
function snapper(values: number[], tol = 0.18) {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const v of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && v - last[last.length - 1] <= tol) last.push(v);
    else clusters.push([v]);
  }
  const centres = clusters.map((c) => r2(Math.round((c.reduce((s, v) => s + v, 0) / c.length) * 20) / 20));
  return (v: number) => {
    let best = v,
      bd = Infinity;
    for (const c of centres) {
      const d = Math.abs(c - v);
      if (d < bd) (bd = d), (best = c);
    }
    return bd <= tol ? best : r2(v);
  };
}

/** Cleans up what the plan reader returned: valid numbers, aligned edges, openings sitting on walls. */
export function normaliseScene(raw: unknown): HomeScene {
  const o = (raw ?? {}) as Record<string, unknown>;
  const types = new Set<string>(ROOM_TYPES);
  let rooms: SceneRoom[] = (Array.isArray(o.rooms) ? o.rooms : [])
    .map((r: Record<string, unknown>) => ({
      name: String(r.name ?? "Room").trim().slice(0, 40) || "Room",
      type: (types.has(String(r.type)) ? String(r.type) : "other") as RoomType,
      x: num(r.x),
      y: num(r.y),
      w: num(r.w),
      d: num(r.d),
    }))
    .filter((r) => [r.x, r.y, r.w, r.d].every(Number.isFinite) && r.w >= 0.6 && r.d >= 0.6 && r.w < 60 && r.d < 60);
  if (!rooms.length) throw new Error("Couldn't find any rooms on that plan. Try a clearer image with room names and sizes.");

  // Move to origin, then align edges.
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  rooms = rooms.map((r) => ({ ...r, x: r.x - minX, y: r.y - minY }));
  const sx = snapper(rooms.flatMap((r) => [r.x, r.x + r.w]));
  const sy = snapper(rooms.flatMap((r) => [r.y, r.y + r.d]));
  rooms = rooms
    .map((r) => {
      const x1 = sx(r.x),
        x2 = sx(r.x + r.w),
        y1 = sy(r.y),
        y2 = sy(r.y + r.d);
      return { ...r, x: x1, y: y1, w: r2(x2 - x1), d: r2(y2 - y1) };
    })
    .filter((r) => r.w >= 0.6 && r.d >= 0.6)
    .slice(0, 40);

  const width = r2(Math.max(...rooms.map((r) => r.x + r.w)));
  const depth = r2(Math.max(...rooms.map((r) => r.y + r.d)));
  const edges = roomEdges(rooms);

  const openings = (list: unknown, isDoor: boolean): Opening[] =>
    (Array.isArray(list) ? list : [])
      .map((d: Record<string, unknown>) => {
        const x = num(d.x) - minX,
          y = num(d.y) - minY;
        const width = Math.min(isDoor ? 1.8 : 3.5, Math.max(isDoor ? 0.7 : 0.5, num(d.width) || (isDoor ? 0.9 : 1.2)));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        // Put it on the nearest wall line it overlaps.
        let best: Opening | null = null,
          bd = 0.6;
        for (const e of edges) {
          if (e.dir === "h") {
            const dist = Math.abs(y - e.at);
            if (dist < bd && x >= e.from - 0.2 && x <= e.to + 0.2) {
              bd = dist;
              const cx = Math.min(Math.max(x, e.from + width / 2 + 0.05), e.to - width / 2 - 0.05);
              best = { x: r2(cx), y: e.at, width: r2(width), dir: "h" };
            }
          } else {
            const dist = Math.abs(x - e.at);
            if (dist < bd && y >= e.from - 0.2 && y <= e.to + 0.2) {
              bd = dist;
              const cy = Math.min(Math.max(y, e.from + width / 2 + 0.05), e.to - width / 2 - 0.05);
              best = { x: e.at, y: r2(cy), width: r2(width), dir: "v" };
            }
          }
        }
        if (best && isDoor && d.main) best.main = true;
        return best;
      })
      .filter((d): d is Opening => !!d)
      .slice(0, 60);

  return {
    v: 1,
    width,
    depth,
    rooms,
    doors: openings(o.doors, true),
    windows: openings(o.windows, false),
    notes: (Array.isArray(o.notes) ? o.notes : []).map(String).filter(Boolean).slice(0, 8),
  };
}

export type Edge = { dir: "h" | "v"; at: number; from: number; to: number };

/** Every room edge as a line segment (h = horizontal at y=at, v = vertical at x=at). */
export function roomEdges(rooms: SceneRoom[]): Edge[] {
  return rooms.flatMap((r) => [
    { dir: "h" as const, at: r.y, from: r.x, to: r.x + r.w },
    { dir: "h" as const, at: r.y + r.d, from: r.x, to: r.x + r.w },
    { dir: "v" as const, at: r.x, from: r.y, to: r.y + r.d },
    { dir: "v" as const, at: r.x + r.w, from: r.y, to: r.y + r.d },
  ]);
}

export type WallPiece = { dir: "h" | "v"; at: number; from: number; to: number; outer: boolean; balcony: boolean };

/**
 * Merges the room edges into wall pieces. A stretch shared by two rooms is an inside wall;
 * a stretch on one room only is an outside wall (a railing if that room is a balcony).
 * Rooms with the same name (L-shapes) don't get a wall between their parts.
 */
export function wallPieces(rooms: SceneRoom[]): WallPiece[] {
  type Span = { from: number; to: number; room: SceneRoom };
  const lines = new Map<string, { dir: "h" | "v"; at: number; spans: Span[] }>();
  for (const r of rooms) {
    const add = (dir: "h" | "v", at: number, from: number, to: number) => {
      const k = `${dir}${at.toFixed(2)}`;
      if (!lines.has(k)) lines.set(k, { dir, at, spans: [] });
      lines.get(k)!.spans.push({ from, to, room: r });
    };
    add("h", r.y, r.x, r.x + r.w);
    add("h", r.y + r.d, r.x, r.x + r.w);
    add("v", r.x, r.y, r.y + r.d);
    add("v", r.x + r.w, r.y, r.y + r.d);
  }
  const out: WallPiece[] = [];
  for (const { dir, at, spans } of lines.values()) {
    const cuts = [...new Set(spans.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i],
        b = cuts[i + 1];
      if (b - a < 0.02) continue;
      const mid = (a + b) / 2;
      const on = spans.filter((s) => s.from <= mid && s.to >= mid);
      if (!on.length) continue;
      const names = new Set(on.map((s) => s.room.name));
      if (on.length >= 2 && names.size === 1) continue; // inside an L-shaped room
      const outer = on.length === 1;
      const piece = { dir, at, from: a, to: b, outer, balcony: outer && on[0].room.type === "balcony" };
      const prev = out[out.length - 1];
      if (prev && prev.dir === dir && prev.at === at && Math.abs(prev.to - a) < 0.001 && prev.outer === outer && prev.balcony === piece.balcony) prev.to = b;
      else out.push(piece);
    }
  }
  return out;
}
