import { axisOf, axisOpenings, type AxisOpening, type HomeScene, type SceneRoom, type Wall } from "@/lib/home-scene";

type Opening = AxisOpening;
/** Furniture stands this far in from a wall's centre line (half an inside wall). */
const INSET = 0.07;

/**
 * Places furniture in each room from its type, size, doors and windows.
 * Pure maths, no three.js — positions are plan metres (x right, y down).
 * rot: which way the piece faces. 0 = towards +y (down the plan), π = up, π/2 = right (+x), -π/2 = left.
 */
export type Kind =
  | "bed"
  | "side_table"
  | "wardrobe"
  | "desk"
  | "office_chair"
  | "dining_set"
  | "sofa"
  | "armchair"
  | "coffee_table"
  | "tv_unit"
  | "rug"
  | "plant"
  | "floor_lamp"
  | "sideboard"
  | "counter"
  | "fridge"
  | "vanity"
  | "wc"
  | "shower"
  | "lounge_set"
  | "planter"
  | "console"
  | "shoe_cabinet"
  | "bookshelf"
  | "puja"
  | "washer"
  | "panel"
  | "art"
  | "pendant"
  | "dresser";

export type Item = {
  kind: Kind;
  room: string;
  x: number;
  y: number;
  w: number; // across the front
  d: number; // front to back
  rot: number;
  opts?: Record<string, number | string | boolean>;
};

type Side = "top" | "bottom" | "left" | "right";
const SIDES: Side[] = ["top", "right", "bottom", "left"];
const ROT: Record<Side, number> = { top: 0, bottom: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
const OPP: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const ADJ: Record<Side, [Side, Side]> = { top: ["left", "right"], bottom: ["right", "left"], left: ["bottom", "top"], right: ["top", "bottom"] };

type Rect = { x: number; y: number; w: number; d: number };
type Box = { x1: number; y1: number; x2: number; y2: number };

class RoomPlanner {
  placed: Box[] = [];
  items: Item[] = [];
  constructor(
    public r: Rect,
    public name: string,
    private doors: Opening[],
    private windows: Opening[],
    private walls: Wall[] = [],
  ) {}

  /** Stretches of side s that have a wall behind them (tall pieces need a full-height wall). */
  covered(s: Side, tall: boolean): [number, number][] {
    const { x, y, w, d } = this.r;
    const horiz = s === "top" || s === "bottom";
    const line = s === "top" ? y : s === "bottom" ? y + d : s === "left" ? x : x + w;
    const from = horiz ? x : y,
      to = horiz ? x + w : y + d;
    const out: [number, number][] = [];
    for (const wl of this.walls) {
      if (tall && wl.kind !== "full") continue;
      const ax = axisOf(wl);
      if (ax !== (horiz ? "h" : "v")) continue;
      const at = horiz ? (wl.a[1] + wl.b[1]) / 2 : (wl.a[0] + wl.b[0]) / 2;
      if (Math.abs(at - line) > Math.max(0.3, wl.t / 2 + 0.15)) continue;
      const p = horiz ? [wl.a[0], wl.b[0]] : [wl.a[1], wl.b[1]];
      const a = Math.max(Math.min(p[0], p[1]), from),
        b = Math.min(Math.max(p[0], p[1]), to);
      if (b - a > 0.05) out.push([a - from, b - from]);
    }
    out.sort((p, q) => p[0] - q[0]);
    const merged: [number, number][] = [];
    for (const iv of out) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1] + 0.08) last[1] = Math.max(last[1], iv[1]);
      else merged.push([...iv]);
    }
    return merged;
  }

  len(s: Side) {
    return s === "top" || s === "bottom" ? this.r.w : this.r.d;
  }
  /** Distance across the room, measured away from side s. */
  depth(s: Side) {
    return s === "top" || s === "bottom" ? this.r.d : this.r.w;
  }
  private onSide(o: Opening, s: Side) {
    const { x, y, w, d } = this.r;
    const e = 0.35;
    if (s === "top" && o.dir === "h" && Math.abs(o.y - y) < e && o.x > x - 0.01 && o.x < x + w + 0.01) return o.x - x;
    if (s === "bottom" && o.dir === "h" && Math.abs(o.y - (y + d)) < e && o.x > x - 0.01 && o.x < x + w + 0.01) return o.x - x;
    if (s === "left" && o.dir === "v" && Math.abs(o.x - x) < e && o.y > y - 0.01 && o.y < y + d + 0.01) return o.y - y;
    if (s === "right" && o.dir === "v" && Math.abs(o.x - (x + w)) < e && o.y > y - 0.01 && o.y < y + d + 0.01) return o.y - y;
    return null;
  }
  doorsOn(s: Side) {
    return this.doors.flatMap((o) => {
      const t = this.onSide(o, s);
      return t === null ? [] : [{ t, w: o.width }];
    });
  }
  windowsOn(s: Side) {
    return this.windows.flatMap((o) => {
      const t = this.onSide(o, s);
      return t === null ? [] : [{ t, w: o.width }];
    });
  }
  hasDoor(s: Side) {
    return this.doorsOn(s).length > 0;
  }

  /** Free stretches along a side, avoiding doors (and windows for tall pieces), and corners next to doors. */
  spans(s: Side, tall: boolean, itemDepth: number, off = 0): [number, number][] {
    const L = this.len(s);
    // A piece standing well clear of the wall (a floating sofa) only needs to avoid the door swing.
    const floating = off >= 0.95;
    const base: [number, number][] = floating ? [[0, L]] : this.covered(s, tall);
    if (!base.length) return [];
    const blocked: [number, number][] = floating ? [] : this.doorsOn(s).map(({ t, w }) => [t - w / 2 - 0.12, t + w / 2 + 0.12]);
    if (tall) for (const { t, w } of this.windowsOn(s)) blocked.push([t - w / 2 - 0.05, t + w / 2 + 0.05]);
    // A door on a neighbouring wall close to this corner needs swing room.
    const [a, b] = s === "top" ? (["left", "right"] as Side[]) : s === "bottom" ? (["left", "right"] as Side[]) : (["top", "bottom"] as Side[]);
    const nearStart = (n: Side) => {
      // distance of that side's doors from this side
      const fromThis = (t: number) => (s === "top" || s === "left" ? t : this.len(n) - t);
      return this.doorsOn(n).some(({ t, w }) => fromThis(t) - w / 2 < itemDepth + 0.1);
    };
    if (!floating && nearStart(a)) blocked.push([0, 0.95]);
    if (!floating && nearStart(b)) blocked.push([L - 0.95, L]);
    blocked.sort((p, q) => p[0] - q[0]);
    const out: [number, number][] = [];
    for (const [bs, be] of base) {
      let cur = Math.max(bs, 0) + INSET;
      const end = Math.min(be, L) - INSET;
      for (const [p, q] of blocked) {
        if (q <= cur || p >= end) continue;
        if (p > cur) out.push([cur, p]);
        cur = Math.max(cur, q);
      }
      if (cur < end) out.push([cur, end]);
    }
    return out.filter(([p, q]) => q - p > 0.3);
  }
  bestSpan(s: Side, tall: boolean, itemDepth: number) {
    return this.spans(s, tall, itemDepth).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0] ?? null;
  }

  /** Plan position of a piece against side s, centred at distance t along it, `off` metres away from the wall. */
  at(s: Side, t: number, w: number, d: number, off = 0) {
    const { x, y } = this.r;
    const k = INSET + off + d / 2;
    if (s === "top") return { x: x + t, y: y + k };
    if (s === "bottom") return { x: x + t, y: y + this.r.d - k };
    if (s === "left") return { x: x + k, y: y + t };
    return { x: x + this.r.w - k, y: y + t };
  }
  box(cx: number, cy: number, w: number, d: number, rot: number): Box {
    const turned = Math.abs(Math.sin(rot)) > 0.5;
    const hw = (turned ? d : w) / 2,
      hd = (turned ? w : d) / 2;
    return { x1: cx - hw, y1: cy - hd, x2: cx + hw, y2: cy + hd };
  }
  fits(b: Box) {
    const { x, y, w, d } = this.r;
    const m = INSET - 0.02;
    if (b.x1 < x + m || b.y1 < y + m || b.x2 > x + w - m || b.y2 > y + d - m) return false;
    return !this.placed.some((p) => b.x1 < p.x2 - 0.02 && b.x2 > p.x1 + 0.02 && b.y1 < p.y2 - 0.02 && b.y2 > p.y1 + 0.02);
  }
  add(kind: Kind, cx: number, cy: number, w: number, d: number, rot: number, opts?: Item["opts"], solid = true) {
    const it: Item = { kind, room: this.name, x: cx, y: cy, w, d, rot, opts };
    this.items.push(it);
    if (solid) this.placed.push(this.box(cx, cy, w, d, rot));
    return it;
  }
  /** Tries to put a piece on side s; slides along the free span until it fits. */
  wall(kind: Kind, s: Side, w: number, d: number, o: { tall?: boolean; t?: number; off?: number; opts?: Item["opts"]; minW?: number } = {}) {
    const spans = this.spans(s, !!o.tall, d + (o.off ?? 0), o.off ?? 0);
    const sorted = [...spans].sort((p, q) => {
      if (o.t !== undefined) {
        const dp = Math.max(0, p[0] - o.t, o.t - p[1]);
        const dq = Math.max(0, q[0] - o.t, o.t - q[1]);
        if (dp !== dq) return dp - dq;
      }
      return q[1] - q[0] - (p[1] - p[0]);
    });
    for (const [p, q] of sorted) {
      let width = Math.min(w, q - p);
      if (width < (o.minW ?? w) - 0.001) continue;
      width = Math.max(width, 0.3);
      const want = o.t ?? (p + q) / 2;
      const start = Math.min(Math.max(want, p + width / 2), q - width / 2);
      for (let k = 0; k < 40; k++) {
        for (const sgn of k === 0 ? [0] : [1, -1]) {
          const t = start + sgn * k * 0.1;
          if (t - width / 2 < p - 0.001 || t + width / 2 > q + 0.001) continue;
          const pos = this.at(s, t, width, d, o.off ?? 0);
          const b = this.box(pos.x, pos.y, width, d, ROT[s]);
          if (this.fits(b)) return this.add(kind, pos.x, pos.y, width, d, ROT[s], o.opts);
        }
      }
    }
    return null;
  }
  /** Free-standing piece at a point. */
  free(kind: Kind, cx: number, cy: number, w: number, d: number, rot: number, opts?: Item["opts"], solid = true) {
    const b = this.box(cx, cy, w, d, rot);
    if (solid && !this.fits(b)) return null;
    return this.add(kind, cx, cy, w, d, rot, opts, solid);
  }
  corner(kind: Kind, size: number, avoid: Side[] = []) {
    const { x, y, w, d } = this.r;
    const m = size / 2 + 0.08 + INSET;
    const corners: [number, number, Side, Side][] = [
      [x + m, y + m, "top", "left"],
      [x + w - m, y + m, "top", "right"],
      [x + w - m, y + d - m, "bottom", "right"],
      [x + m, y + d - m, "bottom", "left"],
    ];
    for (const [cx, cy, s1, s2] of corners) {
      if (avoid.includes(s1) || avoid.includes(s2)) continue;
      const near = (s: Side, along: number) => this.doorsOn(s).some(({ t, w: dw }) => Math.abs(t - along) < dw / 2 + size + 0.3);
      const alongTop = cx - x,
        alongLeft = cy - y;
      if (near(s1, alongTop) || near(s2, alongLeft)) continue;
      if (this.free(kind, cx, cy, size, size, 0)) return true;
    }
    return false;
  }
  /** Side scores: long free stretches, no doors, fewer windows. */
  rank(tall: boolean, need = 0) {
    return [...SIDES]
      .map((s) => {
        const sp = this.bestSpan(s, tall, 0.6);
        const len = sp ? sp[1] - sp[0] : 0;
        return { s, len, score: len - (this.hasDoor(s) ? 0.8 : 0) - this.windowsOn(s).length * 0.3 };
      })
      .filter((x) => x.len >= need)
      .sort((a, b) => b.score - a.score);
  }
}

// ---------- room recipes ----------

function bedroom(P: RoomPlanner, kind: "master" | "normal" | "kids" | "guest") {
  const { r } = P;
  const min = Math.min(r.w, r.d);
  let bedW = kind === "master" ? 1.95 : kind === "kids" ? 1.05 : 1.65;
  if (min < 2.7) bedW = Math.min(bedW, 1.05);
  const bedL = 2.1;
  // Headboard wall: long free stretch, and enough room in front of the bed.
  const pick = P.rank(false, bedW).find((c) => P.depth(c.s) >= bedL + 0.6) ?? P.rank(false, 1)[0];
  if (!pick) return;
  const s = pick.s;
  const sp = P.bestSpan(s, false, bedL)!;
  const t = (sp[0] + sp[1]) / 2;
  const extra = sp[1] - sp[0] - bedW;
  const bed = P.wall("bed", s, bedW, bedL, { t, opts: { single: bedW < 1.3 } });
  if (!bed) return;
  const along = s === "top" || s === "bottom" ? bed.x - r.x : bed.y - r.y;
  const pp = P.at(s, along, 0, 0.03, 0);
  P.add("panel", pp.x, pp.y, Math.min(bedW + (extra > 1.2 ? 1.2 : 0.2), sp[1] - sp[0]), 0.03, bed.rot, { h: 1.25, base: 0.35 }, false);
  if (extra > 1.0) {
    P.wall("side_table", s, 0.45, 0.42, { t: along - bedW / 2 - 0.3 });
    P.wall("side_table", s, 0.45, 0.42, { t: along + bedW / 2 + 0.3 });
  }
  // Rug at the foot half of the bed.
  const fx = bed.x + Math.sin(bed.rot) * 0.55,
    fy = bed.y + Math.cos(bed.rot) * 0.55;
  P.free("rug", fx, fy, bedW + 1.0, 1.8, bed.rot, undefined, false);

  // Wardrobe on another wall.
  const wardLen = kind === "master" ? 2.4 : 1.8;
  const order = [...ADJ[s], OPP[s]].sort((a, b) => (P.bestSpan(b, true, 0.6)?.[1] ?? 0) - (P.bestSpan(b, true, 0.6)?.[0] ?? 0) - ((P.bestSpan(a, true, 0.6)?.[1] ?? 0) - (P.bestSpan(a, true, 0.6)?.[0] ?? 0)));
  let wardSide: Side | null = null;
  for (const ws of order) if (P.wall("wardrobe", ws, wardLen, 0.6, { tall: true, minW: 1.2 })) {
    wardSide = ws;
    break;
  }
  // Desk or dresser if there's room.
  const rest = SIDES.filter((x) => x !== s && x !== wardSide);
  if (kind === "kids" || kind === "guest") {
    for (const ds of rest) {
      const desk = P.wall("desk", ds, 1.2, 0.6, { minW: 1.0 });
      if (desk) {
        P.free("office_chair", desk.x + Math.sin(desk.rot) * 0.55, desk.y + Math.cos(desk.rot) * 0.55, 0.55, 0.55, desk.rot + Math.PI, undefined, false);
        break;
      }
    }
  } else {
    for (const ds of rest) if (P.wall("dresser", ds, 1.1, 0.45, { minW: 0.9 })) break;
  }
  if (kind === "master" && min > 3.4) P.corner("armchair", 0.8);
  P.corner("plant", 0.45);
}

function living(P: RoomPlanner) {
  const ranked = P.rank(false, 1.6);
  // TV wall: a long free wall whose opposite wall can take a sofa.
  const tvChoice = ranked.find((c) => (P.bestSpan(OPP[c.s], false, 0.95)?.[1] ?? 0) - (P.bestSpan(OPP[c.s], false, 0.95)?.[0] ?? 0) >= 1.8) ?? ranked[0];
  if (!tvChoice) return;
  const s = tvChoice.s;
  const sp = P.bestSpan(s, false, 0.45)!;
  const tvW = Math.min(2.4, sp[1] - sp[0]);
  const tv = P.wall("tv_unit", s, tvW, 0.42, { t: (sp[0] + sp[1]) / 2 });
  if (!tv) return;
  const along = s === "top" || s === "bottom" ? tv.x - P.r.x : tv.y - P.r.y;
  const pp = P.at(s, along, 0, 0.03, 0);
  P.add("panel", pp.x, pp.y, Math.min(tvW + 0.6, sp[1] - sp[0]), 0.03, tv.rot, { h: 2.6, base: 0, fluted: true }, false);
  const span = P.depth(s);
  const o = OPP[s];
  const gap = span - 0.42 - 0.95;
  const sofaOff = gap > 3.6 ? span - 0.42 - 0.95 - 3.0 : 0; // float the sofa ~3 m from the TV in big rooms
  const sofaW = Math.min(2.6, Math.max(1.6, P.len(o) * 0.6));
  const sofaOpts = { l: sofaW > 2.3 && P.len(o) > 3.6 };
  let sofa = P.wall("sofa", o, sofaW, 0.95, { t: along, off: sofaOff, minW: 1.6, opts: sofaOpts });
  // Wall blocked by a door or opening: float the sofa about 2.8 m from the TV, facing it.
  // Open-plan rooms: keep it inside the room, and try smaller sofas.
  const fx = Math.sin(tv.rot),
    fy = Math.cos(tv.rot);
  const { x: rx, y: ry, w: rw, d: rd } = P.r;
  let floated = false;
  for (const dist of [2.9, 2.6, 2.3]) {
    if (sofa || span < dist + 0.6) break;
    for (const sw of [sofaW, 2.2, 1.9, 1.6]) {
      if (sofa || sw > sofaW) continue;
      let cx = tv.x + fx * (0.21 + dist),
        cy = tv.y + fy * (0.21 + dist);
      const m = INSET + sw / 2 + 0.05;
      if (Math.abs(fx) > 0.5) cy = Math.min(Math.max(cy, ry + m), ry + rd - m); // sofa runs along y
      else cx = Math.min(Math.max(cx, rx + m), rx + rw - m);
      sofa = P.free("sofa", cx, cy, sw, 0.95, tv.rot + Math.PI, { l: false });
      if (sofa) floated = true;
    }
  }
  if (sofa) {
    const mx = (tv.x + sofa.x) / 2,
      my = (tv.y + sofa.y) / 2;
    P.free("rug", mx + Math.sin(sofa.rot) * 0.2, my + Math.cos(sofa.rot) * 0.2, Math.min(sofaW + 0.6, P.len(o) - 0.3), Math.min(2.4, gap + 0.6), sofa.rot, undefined, false);
    P.free("coffee_table", mx + Math.sin(sofa.rot) * 0.35, my + Math.cos(sofa.rot) * 0.35, 1.1, 0.6, sofa.rot);
    // Armchair beside the coffee table, facing across.
    for (const sgn of [1, -1]) {
      const ax = mx + Math.cos(sofa.rot) * sgn * (sofaW / 2 + 0.55) + Math.sin(sofa.rot) * 0.25;
      const ay = my - Math.sin(sofa.rot) * sgn * (sofaW / 2 + 0.55) + Math.cos(sofa.rot) * 0.25;
      if (P.free("armchair", ax, ay, 0.8, 0.8, sofa.rot - (sgn * Math.PI) / 2)) break;
    }
    const lx = sofa.x + Math.cos(sofa.rot) * (sofaW / 2 + 0.3),
      ly = sofa.y - Math.sin(sofa.rot) * (sofaW / 2 + 0.3);
    P.free("floor_lamp", lx, ly, 0.35, 0.35, 0);
    const back = P.at(o, o === "top" || o === "bottom" ? sofa.x - P.r.x : sofa.y - P.r.y, 0, 0.02, 0);
    if (!sofaOff && !floated) P.add("art", back.x, back.y, Math.min(1.4, sofaW * 0.6), 0.03, ROT[o], { h: 0.8, base: 1.45 }, false);
  }
  P.corner("plant", 0.5);
  P.corner("plant", 0.45);
}

function dining(P: RoomPlanner) {
  const { r } = P;
  const long = Math.max(r.w, r.d),
    short = Math.min(r.w, r.d);
  const six = long >= 3.4 && short >= 2.7;
  const w = six ? 1.8 : 1.2,
    d = six ? 0.95 : 0.85;
  const rot = r.w >= r.d ? 0 : Math.PI / 2;
  const cx = r.x + r.w / 2,
    cy = r.y + r.d / 2;
  P.free("rug", cx, cy, w + 1.4, d + 1.4, rot, undefined, false);
  P.free("dining_set", cx, cy, w + 0.9, d + 1.1, rot, { seats: six ? 6 : 4, tw: w, td: d });
  P.add("pendant", cx, cy, w * 0.8, 0.3, rot, { linear: six }, false);
  for (const s of P.rank(false, 1.2).map((c) => c.s)) if (P.wall("sideboard", s, 1.6, 0.45, { minW: 1.2 })) break;
  P.corner("plant", 0.45);
}

function kitchen(P: RoomPlanner) {
  const ranked = P.rank(true, 1.2);
  if (!ranked.length) return;
  const s1 = ranked[0].s;
  const sp1 = P.bestSpan(s1, false, 0.6)!;
  const hasWin1 = P.windowsOn(s1).length > 0;
  const run1Len = sp1[1] - sp1[0];
  // Fridge at one end of the main run.
  const fridgeT = sp1[1] - 0.38;
  const fr = run1Len > 2.2 ? P.wall("fridge", s1, 0.72, 0.7, { t: fridgeT, tall: true }) : null;
  const c1Len = run1Len - (fr ? 0.76 : 0);
  const c1 = P.wall("counter", s1, c1Len, 0.6, { t: sp1[0] + c1Len / 2, opts: { sink: hasWin1, hob: !hasWin1, uppers: !hasWin1 } });
  // Second run on a neighbouring wall (L) or the opposite wall (parallel) for narrow kitchens.
  const min = Math.min(P.r.w, P.r.d);
  const cands = min >= 2.3 ? [...ADJ[s1], OPP[s1]] : [OPP[s1]];
  for (const s2 of cands) {
    const sp = P.bestSpan(s2, false, 0.6);
    if (!sp || sp[1] - sp[0] < 1.0) continue;
    const isOpp = s2 === OPP[s1];
    if (isOpp && P.depth(s1) < 2.2) continue;
    const c2 = P.wall("counter", s2, sp[1] - sp[0] - 0.62, 0.6, { minW: 0.9, opts: { sink: !!c1 && !hasWin1, hob: hasWin1, uppers: P.windowsOn(s2).length === 0 } });
    if (c2) break;
  }
  P.add("pendant", P.r.x + P.r.w / 2, P.r.y + P.r.d / 2, 0.4, 0.4, 0, { round: true }, false);
}

function bathroom(P: RoomPlanner, powder: boolean) {
  const { r } = P;
  const doorSide = SIDES.find((s) => P.hasDoor(s)) ?? "bottom";
  // Shower in the far corner from the door.
  if (!powder && Math.max(r.w, r.d) >= 1.8) {
    const far = OPP[doorSide];
    const size = Math.min(1.0, Math.min(r.w, r.d) - 0.1);
    const sp = P.bestSpan(far, true, size);
    if (sp) P.wall("shower", far, size, Math.min(1.0, P.depth(far) * 0.45), { t: sp[1] - size / 2, tall: false });
  }
  const order = [ADJ[doorSide][0], ADJ[doorSide][1], OPP[doorSide], doorSide];
  let vSide: Side | null = null;
  for (const s of order) if (P.wall("vanity", s, 0.8, 0.5, { minW: 0.55 })) {
    vSide = s;
    break;
  }
  for (const s of order.filter((x) => x !== vSide).concat(vSide ? [vSide] : [])) if (P.wall("wc", s, 0.42, 0.68)) break;
}

function balcony(P: RoomPlanner) {
  const { r } = P;
  if (Math.min(r.w, r.d) >= 1.1 && Math.max(r.w, r.d) >= 2) {
    const rot = r.w >= r.d ? 0 : Math.PI / 2;
    P.free("lounge_set", r.x + r.w / 2, r.y + r.d / 2, 1.6, Math.min(0.9, Math.min(r.w, r.d) - 0.2), rot);
  }
  P.corner("planter", 0.45);
  P.corner("planter", 0.4);
}

function foyer(P: RoomPlanner) {
  for (const c of P.rank(false, 1.0)) {
    const it = P.wall("console", c.s, 1.2, 0.35, { minW: 0.9 });
    if (it) {
      const along = c.s === "top" || c.s === "bottom" ? it.x - P.r.x : it.y - P.r.y;
      const p = P.at(c.s, along, 0, 0.02, 0);
      P.add("art", p.x, p.y, 0.9, 0.03, it.rot, { h: 0.7, base: 1.3, mirror: true }, false);
      break;
    }
  }
  for (const c of P.rank(true, 0.8)) if (P.wall("shoe_cabinet", c.s, 1.0, 0.35, { tall: true, minW: 0.8 })) break;
}

function study(P: RoomPlanner) {
  const winSide = SIDES.find((s) => P.windowsOn(s).length && !P.hasDoor(s));
  const order = (winSide ? [winSide] : []).concat(P.rank(false, 1).map((c) => c.s));
  for (const s of order) {
    const desk = P.wall("desk", s, 1.4, 0.65, { minW: 1.0 });
    if (desk) {
      P.free("office_chair", desk.x + Math.sin(desk.rot) * 0.6, desk.y + Math.cos(desk.rot) * 0.6, 0.55, 0.55, desk.rot + Math.PI, undefined, false);
      break;
    }
  }
  for (const c of P.rank(true, 0.9)) if (P.wall("bookshelf", c.s, 1.2, 0.35, { tall: true, minW: 0.8 })) break;
  P.corner("plant", 0.45);
}

function puja(P: RoomPlanner) {
  const doorSide = SIDES.find((s) => P.hasDoor(s)) ?? "bottom";
  P.wall("puja", OPP[doorSide], Math.min(1.0, P.len(OPP[doorSide]) - 0.2), 0.45, { minW: 0.6 }) ?? P.wall("puja", ADJ[doorSide][0], 0.9, 0.45, { minW: 0.6 });
}

function utility(P: RoomPlanner) {
  for (const c of P.rank(false, 0.6)) if (P.wall("washer", c.s, 0.62, 0.62)) break;
  for (const c of P.rank(false, 0.9)) if (P.wall("counter", c.s, 1.0, 0.55, { minW: 0.7, opts: { sink: true } })) break;
}

function passage(P: RoomPlanner) {
  const c = P.rank(false, 1.2)[0];
  if (c && P.depth(c.s) >= 1.0) {
    const sp = P.bestSpan(c.s, false, 0)!;
    const p = P.at(c.s, (sp[0] + sp[1]) / 2, 0, 0.02, 0);
    P.add("art", p.x, p.y, Math.min(1.0, sp[1] - sp[0] - 0.2), 0.03, ROT[c.s], { h: 0.7, base: 1.35 }, false);
  }
}

/** Splits a combined living-dining space: living in the bigger part with more windows. */
function splitLivingDining(room: SceneRoom, windows: Opening[]) {
  const horiz = room.w >= room.d;
  const cut = 0.58;
  const a: Rect = horiz ? { x: room.x, y: room.y, w: room.w * cut, d: room.d } : { x: room.x, y: room.y, w: room.w, d: room.d * cut };
  const b: Rect = horiz ? { x: room.x + room.w * cut, y: room.y, w: room.w * (1 - cut), d: room.d } : { x: room.x, y: room.y + room.d * cut, w: room.w, d: room.d * (1 - cut) };
  const inside = (o: Opening, r: Rect) => o.x >= r.x - 0.05 && o.x <= r.x + r.w + 0.05 && o.y >= r.y - 0.05 && o.y <= r.y + r.d + 0.05;
  const wa = windows.filter((o) => inside(o, a)).length,
    wb = windows.filter((o) => inside(o, b)).length;
  // Living takes the bigger share on the side with more windows.
  const swap = wb > wa;
  const big = 1 - cut;
  const liveB: Rect = horiz ? { x: room.x + room.w * big, y: room.y, w: room.w * cut, d: room.d } : { x: room.x, y: room.y + room.d * big, w: room.w, d: room.d * cut };
  const dineA: Rect = horiz ? { x: room.x, y: room.y, w: room.w * big, d: room.d } : { x: room.x, y: room.y, w: room.w, d: room.d * big };
  return {
    live: swap ? liveB : a,
    dine: swap ? dineA : b,
    liveOpen: (horiz ? (swap ? "left" : "right") : swap ? "top" : "bottom") as Side,
    dineOpen: (horiz ? (swap ? "right" : "left") : swap ? "bottom" : "top") as Side,
    horiz,
  };
}

export function furnish(scene: HomeScene): Item[] {
  const items: Item[] = [];
  // Rooms with the same name (L-shapes): furnish the biggest part only.
  const biggest = new Map<string, SceneRoom>();
  for (const r of scene.rooms) {
    const b = biggest.get(r.name);
    if (!b || r.w * r.d > b.w * b.d) biggest.set(r.name, r);
  }
  const { doors, windows } = axisOpenings(scene);
  for (const room of biggest.values()) {
    // Open sides (no wall drawn) get no furniture against them.
    const run = (rect: Rect, _open: Side[], fn: (P: RoomPlanner) => void) => {
      const P = new RoomPlanner(rect, room.name, doors, windows, scene.walls);
      try {
        fn(P);
      } catch {}
      items.push(...P.items);
    };
    const r: Rect = room;
    switch (room.type) {
      case "master_bedroom":
        run(r, [], (P) => bedroom(P, "master"));
        break;
      case "bedroom":
        run(r, [], (P) => bedroom(P, "normal"));
        break;
      case "kids_bedroom":
        run(r, [], (P) => bedroom(P, "kids"));
        break;
      case "guest_bedroom":
        run(r, [], (P) => bedroom(P, "guest"));
        break;
      case "living":
        run(r, [], living);
        break;
      case "dining":
        run(r, [], dining);
        break;
      case "living_dining": {
        if (Math.max(room.w, room.d) < 4.5) {
          run(r, [], living);
          break;
        }
        const s = splitLivingDining(room, windows);
        run(s.live, [s.liveOpen], living);
        run(s.dine, [s.dineOpen], dining);
        break;
      }
      case "kitchen":
        run(r, [], kitchen);
        break;
      case "bathroom":
        run(r, [], (P) => bathroom(P, false));
        break;
      case "powder":
        run(r, [], (P) => bathroom(P, true));
        break;
      case "balcony":
        run(r, [], balcony);
        break;
      case "foyer":
        run(r, [], foyer);
        break;
      case "passage":
        run(r, [], passage);
        break;
      case "study":
        run(r, [], study);
        break;
      case "puja":
        run(r, [], puja);
        break;
      case "utility":
        run(r, [], utility);
        break;
      case "other":
        run(r, [], (P) => void P.corner("plant", 0.45));
        break;
      default:
        break;
    }
  }
  return items;
}
