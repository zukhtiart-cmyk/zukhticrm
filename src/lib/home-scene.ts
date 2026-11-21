/**
 * The 3D home made from a floor plan. Shared by the server (plan reader), the Check plan editor and the 3D viewer.
 *
 * Version 2 is walls-first:
 * - walls are their own pieces (full, half, glass partition, balcony railing) at any angle;
 * - doors, archways, sliding doors and windows sit on a wall;
 * - rooms are named floor areas (rectangles) — two rooms can share an open edge with no wall.
 * Units are metres, measured from the top-left corner of the plan image (x right, y down).
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

export const ROOM_LABELS: Record<RoomType, string> = {
  living: "Living",
  dining: "Dining",
  living_dining: "Living + dining",
  kitchen: "Kitchen",
  master_bedroom: "Master bedroom",
  bedroom: "Bedroom",
  kids_bedroom: "Kids bedroom",
  guest_bedroom: "Guest bedroom",
  bathroom: "Bathroom",
  powder: "Powder room",
  balcony: "Balcony",
  foyer: "Foyer / entrance",
  passage: "Passage",
  study: "Study",
  puja: "Puja",
  utility: "Utility",
  store: "Store",
  other: "Other",
};

export const INTERIOR_STYLES = ["modern", "luxury", "japandi", "minimalist", "scandinavian", "traditional", "industrial", "coastal"] as const;
export type InteriorStyle = (typeof INTERIOR_STYLES)[number];

export const WALL_KINDS = ["full", "half", "glass", "railing"] as const;
export type WallKind = (typeof WALL_KINDS)[number];
export const OPENING_TYPES = ["door", "opening", "sliding", "window"] as const;
export type OpeningType = (typeof OPENING_TYPES)[number];

export type Pt = [number, number];
export type Wall = { id: string; a: Pt; b: Pt; kind: WallKind; t: number };
export type WallOpening = { id: string; wall: string; at: number; width: number; type: OpeningType; main?: boolean; flip?: boolean };
export type SceneRoom = { id: string; name: string; type: RoomType; x: number; y: number; w: number; d: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };

export type HomeScene = {
  v: 2;
  walls: Wall[];
  openings: WallOpening[];
  rooms: SceneRoom[];
  notes: string[];
  /** The plan picture behind the editor: drawn at (0,0) with this size in metres. */
  underlay?: { url: string; w: number; h: number };
  /** Whether walls have been lined up with the plan picture yet. */
  snapped?: boolean;
  /** Bounds of everything, worked out when saved. */
  box: Box;
};

export const WALL_H = 2.9;
export const DOOR_H = 2.15;
export const SILL_H = 0.9;
export const HEAD_H = 2.2;
export const HALF_H = 1.05;

export const KIND_HEIGHT: Record<WallKind, number> = { full: WALL_H, half: HALF_H, glass: WALL_H, railing: 1.05 };
export const DEFAULT_T = { exterior: 0.23, interior: 0.12, half: 0.12, glass: 0.08, railing: 0.08 };
export const OPENING_WIDTH: Record<OpeningType, number> = { door: 0.9, opening: 1.2, sliding: 1.8, window: 1.2 };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v));
const finite = (...v: number[]) => v.every(Number.isFinite);
let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const wallLen = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
/** Point on a wall `at` metres from its start. */
export function along(w: Wall, at: number): Pt {
  const L = wallLen(w) || 1;
  return [w.a[0] + ((w.b[0] - w.a[0]) * at) / L, w.a[1] + ((w.b[1] - w.a[1]) * at) / L];
}
/** Projects a point onto a wall: distance along it and distance from it. */
export function project(w: Wall, p: Pt) {
  const dx = w.b[0] - w.a[0],
    dy = w.b[1] - w.a[1];
  const L2 = dx * dx + dy * dy || 1;
  const t = ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / L2;
  const tc = Math.max(0, Math.min(1, t));
  const qx = w.a[0] + dx * tc,
    qy = w.a[1] + dy * tc;
  return { at: tc * Math.sqrt(L2), dist: Math.hypot(p[0] - qx, p[1] - qy), inside: t >= 0 && t <= 1 };
}
/** "h" or "v" when a wall runs (almost) straight across or down the plan. */
export function axisOf(w: Wall): "h" | "v" | null {
  const a = Math.atan2(Math.abs(w.b[1] - w.a[1]), Math.abs(w.b[0] - w.a[0]));
  if (a < 0.07) return "h";
  if (a > Math.PI / 2 - 0.07) return "v";
  return null;
}

export function sceneBox(s: Pick<HomeScene, "walls" | "rooms">): Box {
  const xs: number[] = [],
    ys: number[] = [];
  for (const w of s.walls) xs.push(w.a[0], w.b[0]), ys.push(w.a[1], w.b[1]);
  for (const r of s.rooms) xs.push(r.x, r.x + r.w), ys.push(r.y, r.y + r.d);
  if (!xs.length) return { x0: 0, y0: 0, x1: 10, y1: 10 };
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Checks and tidies a scene (from the editor, the plan reader or an old saved version). */
export function normaliseScene(raw: unknown): HomeScene {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (o.v !== 2 && Array.isArray(o.rooms) && !Array.isArray(o.walls)) return migrateV1(raw);
  const types = new Set<string>(ROOM_TYPES);
  const kinds = new Set<string>(WALL_KINDS);
  const otypes = new Set<string>(OPENING_TYPES);
  const ids = new Set<string>();
  const uid = (v: unknown, p: string) => {
    let id = typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : newId(p);
    while (ids.has(id)) id = newId(p);
    ids.add(id);
    return id;
  };

  const walls: Wall[] = (Array.isArray(o.walls) ? o.walls : [])
    .map((w: Record<string, unknown>) => {
      const a = Array.isArray(w.a) ? w.a : [],
        b = Array.isArray(w.b) ? w.b : [];
      const ax = num(a[0]),
        ay = num(a[1]),
        bx = num(b[0]),
        by = num(b[1]);
      const kind = (kinds.has(String(w.kind)) ? String(w.kind) : "full") as WallKind;
      const t = Math.min(0.5, Math.max(0.04, num(w.t) || (kind === "full" ? DEFAULT_T.interior : DEFAULT_T[kind])));
      return { id: String(w.id ?? ""), a: [r3(ax), r3(ay)] as Pt, b: [r3(bx), r3(by)] as Pt, kind, t: r3(t) };
    })
    .filter((w) => finite(w.a[0], w.a[1], w.b[0], w.b[1]) && wallLen(w) >= 0.1 && wallLen(w) < 80)
    .slice(0, 400)
    .map((w) => ({ ...w, id: uid(w.id, "w") }));
  const byId = new Map(walls.map((w) => [w.id, w]));

  const openings: WallOpening[] = (Array.isArray(o.openings) ? o.openings : [])
    .map((p: Record<string, unknown>) => {
      const wall = byId.get(String(p.wall));
      if (!wall) return null;
      const type = (otypes.has(String(p.type)) ? String(p.type) : "door") as OpeningType;
      const L = wallLen(wall);
      const width = Math.min(L - 0.05, Math.max(0.3, num(p.width) || OPENING_WIDTH[type]));
      if (width < 0.3) return null;
      const at = Math.min(L - width / 2, Math.max(width / 2, num(p.at)));
      if (!Number.isFinite(at)) return null;
      const op: WallOpening = { id: String(p.id ?? ""), wall: wall.id, at: r3(at), width: r3(width), type };
      if (p.main && type !== "window") op.main = true;
      if (p.flip) op.flip = true;
      return op;
    })
    .filter((p): p is WallOpening => !!p)
    .slice(0, 300)
    .map((p) => ({ ...p, id: uid(p.id, "o") }));

  const rooms: SceneRoom[] = (Array.isArray(o.rooms) ? o.rooms : [])
    .map((r: Record<string, unknown>) => {
      let x = num(r.x),
        y = num(r.y),
        w = num(r.w),
        d = num(r.d);
      if (w < 0) (x += w), (w = -w);
      if (d < 0) (y += d), (d = -d);
      return {
        id: String(r.id ?? ""),
        name: String(r.name ?? "Room").trim().slice(0, 40) || "Room",
        type: (types.has(String(r.type)) ? String(r.type) : "other") as RoomType,
        x: r3(x),
        y: r3(y),
        w: r3(w),
        d: r3(d),
      };
    })
    .filter((r) => finite(r.x, r.y, r.w, r.d) && r.w >= 0.5 && r.d >= 0.5 && r.w < 60 && r.d < 60)
    .slice(0, 60)
    .map((r) => ({ ...r, id: uid(r.id, "r") }));

  if (!walls.length && !rooms.length) throw new Error("Couldn't find any walls or rooms on that plan. Try a clearer image with the walls drawn dark.");

  const u = o.underlay as Record<string, unknown> | undefined;
  const underlay =
    u && typeof u.url === "string" && u.url.length < 600 && (u.url.startsWith("/") || u.url.startsWith("https://")) && num(u.w) > 0 && num(u.h) > 0
      ? { url: u.url, w: r3(num(u.w)), h: r3(num(u.h)) }
      : undefined;
  const scene: HomeScene = {
    v: 2,
    walls,
    openings,
    rooms,
    notes: (Array.isArray(o.notes) ? o.notes : []).map(String).filter(Boolean).slice(0, 10),
    box: { x0: 0, y0: 0, x1: 0, y1: 0 },
  };
  if (underlay) scene.underlay = underlay;
  if (o.snapped) scene.snapped = true;
  scene.box = sceneBox(scene);
  return scene;
}

// ---------- reading a plan (Claude's answer, in thousandths of the image) ----------

export type PlanReading = {
  image_width_m?: number;
  scale_ref?: { x1: number; y1: number; x2: number; y2: number; length_m: number };
  walls?: { x1: number; y1: number; x2: number; y2: number; kind?: string; exterior?: boolean }[];
  openings?: { wall?: number; x: number; y: number; width_m?: number; type?: string; main?: boolean }[];
  rooms?: { name: string; type: string; x1: number; y1: number; x2: number; y2: number }[];
  notes?: string[];
};

/**
 * Turns the plan reader's answer (coordinates in thousandths of the image width/height) into a scene in metres.
 * imgW/imgH are the pixel size of the picture it read.
 */
export function sceneFromReading(rd: PlanReading, imgW: number, imgH: number, underlayUrl?: string): HomeScene {
  const pxX = (v: number) => (num(v) / 1000) * imgW;
  const pxY = (v: number) => (num(v) / 1000) * imgH;
  // Metres per pixel: from a labelled dimension if given, else the stated plan width.
  let mpp = 0;
  const ref = rd.scale_ref;
  if (ref && num(ref.length_m) > 0.5) {
    const len = Math.hypot(pxX(ref.x2) - pxX(ref.x1), pxY(ref.y2) - pxY(ref.y1));
    if (len > 20) mpp = num(ref.length_m) / len;
  }
  const byWidth = num(rd.image_width_m) > 0 ? num(rd.image_width_m) / imgW : 0;
  if (!(mpp > 0) || (byWidth > 0 && (mpp / byWidth > 1.6 || byWidth / mpp > 1.6))) mpp = byWidth || mpp;
  if (!(mpp > 0) || imgW * mpp < 3 || imgW * mpp > 200) mpp = 15 / imgW;
  const P = (x: number, y: number): Pt => [r3(pxX(x) * mpp), r3(pxY(y) * mpp)];

  const walls: Wall[] = (rd.walls ?? []).map((w, i) => {
    const kind = (WALL_KINDS as readonly string[]).includes(String(w.kind)) ? (w.kind as WallKind) : "full";
    const t = kind === "full" ? (w.exterior ? DEFAULT_T.exterior : DEFAULT_T.interior) : DEFAULT_T[kind];
    return { id: `w${i}`, a: P(w.x1, w.y1), b: P(w.x2, w.y2), kind, t };
  });
  // Straighten nearly straight walls.
  for (const w of walls) {
    const ax = axisOf(w);
    if (ax === "h") w.a[1] = w.b[1] = r3((w.a[1] + w.b[1]) / 2);
    if (ax === "v") w.a[0] = w.b[0] = r3((w.a[0] + w.b[0]) / 2);
  }
  const openings: WallOpening[] = [];
  for (const [i, op] of (rd.openings ?? []).entries()) {
    const p = P(op.x, op.y);
    const type = (OPENING_TYPES as readonly string[]).includes(String(op.type)) ? (op.type as OpeningType) : "door";
    let wall = typeof op.wall === "number" ? walls[op.wall] : undefined;
    if (!wall || project(wall, p).dist > 0.6) {
      wall = undefined;
      let best = 0.8;
      for (const w of walls) {
        const pr = project(w, p);
        if (pr.dist < best && pr.inside) (best = pr.dist), (wall = w);
      }
    }
    if (!wall) continue;
    openings.push({ id: `o${i}`, wall: wall.id, at: project(wall, p).at, width: num(op.width_m) || OPENING_WIDTH[type], type, ...(op.main ? { main: true } : {}) });
  }
  const rooms = (rd.rooms ?? []).map((r, i) => {
    const a = P(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2)),
      b = P(Math.max(r.x1, r.x2), Math.max(r.y1, r.y2));
    return { id: `r${i}`, name: r.name, type: r.type, x: a[0], y: a[1], w: b[0] - a[0], d: b[1] - a[1] };
  });
  return alignRooms(normaliseScene({
    v: 2,
    walls,
    openings,
    rooms,
    notes: rd.notes ?? [],
    underlay: underlayUrl ? { url: underlayUrl, w: imgW * mpp, h: imgH * mpp } : undefined,
  }));
}

/** Moves room edges onto the nearest parallel wall (within `tol` metres), so floors meet the walls. */
export function alignRooms(s: HomeScene, tol = 0.45): HomeScene {
  const hs = s.walls.filter((w) => axisOf(w) === "h").map((w) => ({ at: (w.a[1] + w.b[1]) / 2, lo: Math.min(w.a[0], w.b[0]), hi: Math.max(w.a[0], w.b[0]) }));
  const vs = s.walls.filter((w) => axisOf(w) === "v").map((w) => ({ at: (w.a[0] + w.b[0]) / 2, lo: Math.min(w.a[1], w.b[1]), hi: Math.max(w.a[1], w.b[1]) }));
  const near = (lines: typeof hs, at: number, lo: number, hi: number) => {
    let best = at,
      bd = tol;
    for (const l of lines) {
      const overlap = Math.min(hi, l.hi) - Math.max(lo, l.lo);
      if (overlap < Math.min(0.4, (hi - lo) * 0.3)) continue;
      const d = Math.abs(l.at - at);
      if (d < bd) (bd = d), (best = l.at);
    }
    return best;
  };
  const rooms = s.rooms.map((r) => {
    const top = near(hs, r.y, r.x, r.x + r.w),
      bottom = near(hs, r.y + r.d, r.x, r.x + r.w);
    const left = near(vs, r.x, r.y, r.y + r.d),
      right = near(vs, r.x + r.w, r.y, r.y + r.d);
    if (right - left < 0.5 || bottom - top < 0.5) return r;
    return { ...r, x: r3(left), y: r3(top), w: r3(right - left), d: r3(bottom - top) };
  });
  const out = { ...s, rooms };
  out.box = sceneBox(out);
  return out;
}

export type RawReading = Omit<PlanReading, "walls" | "openings"> & { walls?: unknown; openings?: unknown };
const KIND: Record<string, string> = { F: "full", FE: "full", H: "half", G: "glass", R: "railing" };
const OTYPE: Record<string, string> = { D: "door", O: "opening", S: "sliding", W: "window" };

/** Turns the compact one-per-line wall and opening lists into objects. */
export function parseReading(r: RawReading): PlanReading {
  const lines = (v: unknown) =>
    typeof v === "string"
      ? v
          .split(/\n|;/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => l.split(/\s*,\s*|\s+/))
      : [];
  const walls = Array.isArray(r.walls)
    ? (r.walls as PlanReading["walls"])
    : lines(r.walls).map((p) => {
        const k = String(p[4] ?? "F").toUpperCase();
        return { x1: +p[0], y1: +p[1], x2: +p[2], y2: +p[3], kind: KIND[k] ?? "full", exterior: k === "FE" };
      });
  const openings = Array.isArray(r.openings)
    ? (r.openings as PlanReading["openings"])
    : lines(r.openings).map((p) => ({ wall: +p[0], x: +p[1], y: +p[2], width_m: +p[3], type: OTYPE[String(p[4] ?? "D").toUpperCase()] ?? "door", main: String(p[5] ?? "").toUpperCase() === "M" }));
  return { ...r, walls, openings };
}


// ---------- helpers for furnishing and walking ----------

export type AxisOpening = { x: number; y: number; width: number; dir: "h" | "v"; main?: boolean; kind: OpeningType };

/** Openings on straight walls, as centre points — what the furniture planner works with. */
export function axisOpenings(s: HomeScene) {
  const byId = new Map(s.walls.map((w) => [w.id, w]));
  const doors: AxisOpening[] = [],
    windows: AxisOpening[] = [];
  for (const o of s.openings) {
    const w = byId.get(o.wall);
    if (!w) continue;
    const ax = axisOf(w) ?? (Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1]) ? "h" : "v");
    const [x, y] = along(w, o.at);
    const item = { x, y, width: o.width, dir: ax, kind: o.type, ...(o.main ? { main: true } : {}) };
    (o.type === "window" ? windows : doors).push(item);
    if (o.type === "sliding") windows.push(item);
  }
  return { doors, windows };
}

// ---------- old saved scenes (version 1: rooms only) ----------

type V1Room = { name: string; type: RoomType; x: number; y: number; w: number; d: number };
type V1Opening = { x: number; y: number; width: number; dir: "h" | "v"; main?: boolean };

function migrateV1(raw: unknown): HomeScene {
  const o = raw as { rooms: V1Room[]; doors?: V1Opening[]; windows?: V1Opening[]; notes?: string[] };
  const rooms = o.rooms.filter((r) => finite(r.x, r.y, r.w, r.d));
  const pieces = v1WallPieces(rooms);
  const walls: Wall[] = pieces.map((p, i) => ({
    id: `w${i}`,
    a: (p.dir === "h" ? [p.from, p.at] : [p.at, p.from]) as Pt,
    b: (p.dir === "h" ? [p.to, p.at] : [p.at, p.to]) as Pt,
    kind: p.balcony ? "railing" : "full",
    t: p.balcony ? DEFAULT_T.railing : p.outer ? 0.2 : DEFAULT_T.interior,
  }));
  const openings: WallOpening[] = [];
  const place = (list: V1Opening[] | undefined, type: OpeningType) =>
    (list ?? []).forEach((op, i) => {
      const w = walls.find((w) => axisOf(w) === op.dir && project(w, [op.x, op.y]).dist < 0.05 && project(w, [op.x, op.y]).inside);
      if (w) openings.push({ id: `${type[0]}${i}`, wall: w.id, at: project(w, [op.x, op.y]).at, width: op.width, type, ...(op.main ? { main: true } : {}) });
    });
  place(o.doors, "door");
  place(o.windows, "window");
  return normaliseScene({ v: 2, walls, openings, rooms: rooms.map((r, i) => ({ ...r, id: `r${i}` })), notes: o.notes ?? [], snapped: true });
}

type V1Piece = { dir: "h" | "v"; at: number; from: number; to: number; outer: boolean; balcony: boolean };
function v1WallPieces(rooms: V1Room[]): V1Piece[] {
  type Span = { from: number; to: number; room: V1Room };
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
  const out: V1Piece[] = [];
  for (const { dir, at, spans } of lines.values()) {
    const cuts = [...new Set(spans.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i],
        b = cuts[i + 1];
      if (b - a < 0.02) continue;
      const mid = (a + b) / 2;
      const on = spans.filter((s) => s.from <= mid && s.to >= mid);
      if (!on.length) continue;
      if (on.length >= 2 && new Set(on.map((s) => s.room.name)).size === 1) continue;
      const outer = on.length === 1;
      const piece = { dir, at, from: a, to: b, outer, balcony: outer && on[0].room.type === "balcony" };
      const prev = out[out.length - 1];
      if (prev && prev.dir === dir && prev.at === at && Math.abs(prev.to - a) < 0.001 && prev.outer === outer && prev.balcony === piece.balcony) prev.to = b;
      else out.push(piece);
    }
  }
  return out;
}
