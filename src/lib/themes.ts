/**
 * Design themes ("kits") and the per-design look: theme + mood + room-by-room overrides + saved camera shots.
 * Shared by the server (saving, Claude reading Pinterest pictures) and the browser (3D).
 */

export const FINISH_KINDS = ["wood", "herringbone", "marble", "tile", "concrete", "terrazzo"] as const;
export type FinishKind = (typeof FINISH_KINDS)[number];
export type Finish = { kind: FinishKind; base: string; alt: string };

export const BED_STYLES = ["panel", "tufted", "channel", "platform", "wingback", "slatted"] as const;
export const SOFA_STYLES = ["boxy", "curved", "tufted", "low", "track"] as const;
export const LEG_STYLES = ["metal", "brass", "wood", "plinth"] as const;
export const FEATURE_TREATMENTS = ["fluted", "slats", "moulding", "stone", "marble", "wallpaper", "paint"] as const;
export const CEILING_STYLES = ["plain", "cove", "tray", "rafters"] as const;
export const FIXTURE_STYLES = ["pendant", "globe", "chandelier", "linear", "rattan"] as const;
export type BedStyle = (typeof BED_STYLES)[number];
export type SofaStyle = (typeof SOFA_STYLES)[number];
export type LegStyle = (typeof LEG_STYLES)[number];
export type FeatureTreatment = (typeof FEATURE_TREATMENTS)[number];
export type CeilingStyle = (typeof CEILING_STYLES)[number];
export type FixtureStyle = (typeof FIXTURE_STYLES)[number];

export const STYLE_LABELS: Record<string, string> = {
  panel: "Panel headboard",
  tufted: "Tufted / button",
  channel: "Channel-stitched",
  platform: "Low platform",
  wingback: "Wingback",
  slatted: "Wood slats",
  boxy: "Boxy modern",
  curved: "Curved",
  low: "Low lounge",
  track: "Track arms",
  metal: "Black metal legs",
  brass: "Brass legs",
  wood: "Wood",
  plinth: "Plinth base",
  fluted: "Fluted panels",
  slats: "Wooden slats",
  moulding: "Wall moulding",
  stone: "Stone cladding",
  marble: "Marble",
  wallpaper: "Wallpaper",
  paint: "Paint colour",
  plain: "Plain",
  cove: "Cove lights",
  tray: "Tray / stepped",
  rafters: "Wooden rafters",
  pendant: "Pendant",
  globe: "Glass globes",
  chandelier: "Chandelier",
  linear: "Linear light",
  rattan: "Rattan pendant",
  herringbone: "Herringbone wood",
  tile: "Tiles",
  concrete: "Concrete / microcement",
  terrazzo: "Terrazzo",
};

export type FeatureWall = { treatment: FeatureTreatment; color: string; pattern?: string };

export type Theme = {
  id: string;
  label: string;
  blurb: string;
  floor: Finish;
  wetFloor: Finish;
  wall: string;
  feature: FeatureWall;
  wood: string;
  woodDark: string;
  fabric: string;
  fabricAlt: string;
  accent: string;
  metal: string;
  metalRough: number;
  counter: string;
  cabinet: string;
  rug: string;
  curtains: string;
  bed: BedStyle;
  sofa: SofaStyle;
  legs: LegStyle;
  ceiling: CeilingStyle;
  fixture: FixtureStyle;
  /** 0–3: how much décor (plants, art, vases). */
  decor: number;
};

const T = (t: Theme) => t;
export const THEMES: Record<string, Theme> = {
  modern: T({
    id: "modern",
    label: "Modern",
    blurb: "Warm oak, soft greys, black metal, clean lines",
    floor: { kind: "wood", base: "#c9a77c", alt: "#b48f63" },
    wetFloor: { kind: "tile", base: "#c9c5bd", alt: "#bdb8af" },
    wall: "#efe9e1",
    feature: { treatment: "fluted", color: "#8a6a4a" },
    wood: "#8a6a4a",
    woodDark: "#4b3a2c",
    fabric: "#b9b3aa",
    fabricAlt: "#5e6a73",
    accent: "#c46a3c",
    metal: "#2a2a2a",
    metalRough: 0.4,
    counter: "#e9e6e1",
    cabinet: "#f1eee9",
    rug: "#d8d0c4",
    curtains: "#e8e2d8",
    bed: "panel",
    sofa: "boxy",
    legs: "metal",
    ceiling: "cove",
    fixture: "linear",
    decor: 2,
  }),
  luxury: T({
    id: "luxury",
    label: "Luxury",
    blurb: "Italian marble, walnut, velvet, brass",
    floor: { kind: "marble", base: "#f2eee8", alt: "#b9b2a8" },
    wetFloor: { kind: "marble", base: "#e9e3da", alt: "#a89f92" },
    wall: "#e8dfd2",
    feature: { treatment: "marble", color: "#efe8de" },
    wood: "#5a3a24",
    woodDark: "#2e1e14",
    fabric: "#24414f",
    fabricAlt: "#d9cbb5",
    accent: "#2f5e4e",
    metal: "#c8a25a",
    metalRough: 0.25,
    counter: "#1f1f1f",
    cabinet: "#3a2c22",
    rug: "#cbbba3",
    curtains: "#d9cbb5",
    bed: "channel",
    sofa: "curved",
    legs: "brass",
    ceiling: "tray",
    fixture: "chandelier",
    decor: 3,
  }),
  contemporary_indian: T({
    id: "contemporary_indian",
    label: "Contemporary Indian",
    blurb: "Teak, cane, jewel tones, brass, handcrafted touches",
    floor: { kind: "marble", base: "#efe6d6", alt: "#c9b48f" },
    wetFloor: { kind: "tile", base: "#ddd3c2", alt: "#cfc3ae" },
    wall: "#f1e6d4",
    feature: { treatment: "wallpaper", color: "#2f5e4e" },
    wood: "#7a4a24",
    woodDark: "#4a2c16",
    fabric: "#e8dcc6",
    fabricAlt: "#1f5e5b",
    accent: "#b5452e",
    metal: "#b88a3e",
    metalRough: 0.3,
    counter: "#2b2622",
    cabinet: "#8a5a35",
    rug: "#b5452e",
    curtains: "#c9962e",
    bed: "slatted",
    sofa: "track",
    legs: "wood",
    ceiling: "cove",
    fixture: "rattan",
    decor: 3,
  }),
  japandi: T({
    id: "japandi",
    label: "Japandi",
    blurb: "Pale ash, linen, low furniture, calm and earthy",
    floor: { kind: "wood", base: "#d8c3a0", alt: "#c7ae86" },
    wetFloor: { kind: "tile", base: "#cfc6b8", alt: "#c2b8a8" },
    wall: "#ece4d8",
    feature: { treatment: "slats", color: "#a07850" },
    wood: "#a07850",
    woodDark: "#5c4a3a",
    fabric: "#d9cfc0",
    fabricAlt: "#6b7a5e",
    accent: "#5b6b4f",
    metal: "#1d1d1d",
    metalRough: 0.6,
    counter: "#e4ddd2",
    cabinet: "#c9b08e",
    rug: "#cfc3ae",
    curtains: "#eee6da",
    bed: "platform",
    sofa: "low",
    legs: "wood",
    ceiling: "plain",
    fixture: "rattan",
    decor: 1,
  }),
  minimalist: T({
    id: "minimalist",
    label: "Minimalist",
    blurb: "Microcement, white, hidden storage, almost nothing on show",
    floor: { kind: "concrete", base: "#d3cfc8", alt: "#c4bfb7" },
    wetFloor: { kind: "tile", base: "#d6d3ce", alt: "#cbc8c2" },
    wall: "#f4f2ee",
    feature: { treatment: "paint", color: "#e2ded7" },
    wood: "#d1b38a",
    woodDark: "#8c7458",
    fabric: "#e5e1da",
    fabricAlt: "#a7a39c",
    accent: "#8e8a83",
    metal: "#bdbdbd",
    metalRough: 0.35,
    counter: "#f2f0ec",
    cabinet: "#f3f1ed",
    rug: "#e6e1d8",
    curtains: "#f4f2ee",
    bed: "platform",
    sofa: "boxy",
    legs: "plinth",
    ceiling: "cove",
    fixture: "linear",
    decor: 0,
  }),
  scandinavian: T({
    id: "scandinavian",
    label: "Scandinavian",
    blurb: "White oak, soft blues, cosy textiles, bright",
    floor: { kind: "wood", base: "#e2cfae", alt: "#d4be98" },
    wetFloor: { kind: "tile", base: "#e4e2dd", alt: "#d8d5cf" },
    wall: "#f6f4f0",
    feature: { treatment: "paint", color: "#9fb3bf" },
    wood: "#e0c49a",
    woodDark: "#9c7c55",
    fabric: "#c9ced2",
    fabricAlt: "#7d9bb0",
    accent: "#e2b34a",
    metal: "#2b2b2b",
    metalRough: 0.5,
    counter: "#f4f3f0",
    cabinet: "#f6f5f2",
    rug: "#ece8e1",
    curtains: "#f2efe9",
    bed: "panel",
    sofa: "track",
    legs: "wood",
    ceiling: "plain",
    fixture: "globe",
    decor: 2,
  }),
  neo_classical: T({
    id: "neo_classical",
    label: "Neo-classical",
    blurb: "Wall mouldings, ivory and gold, tufted pieces, chandeliers",
    floor: { kind: "herringbone", base: "#b58a5c", alt: "#9c7247" },
    wetFloor: { kind: "marble", base: "#f0ebe3", alt: "#b9b0a2" },
    wall: "#f2ece2",
    feature: { treatment: "moulding", color: "#f2ece2" },
    wood: "#6b4a2e",
    woodDark: "#3d2a1a",
    fabric: "#e9e1d3",
    fabricAlt: "#8c7a5b",
    accent: "#b38b3f",
    metal: "#c9a45a",
    metalRough: 0.25,
    counter: "#efeae2",
    cabinet: "#efe9df",
    rug: "#d9cdb8",
    curtains: "#d9cbb0",
    bed: "wingback",
    sofa: "tufted",
    legs: "wood",
    ceiling: "tray",
    fixture: "chandelier",
    decor: 3,
  }),
  art_deco: T({
    id: "art_deco",
    label: "Art Deco",
    blurb: "Emerald and black, fluted curves, brass, glamour",
    floor: { kind: "herringbone", base: "#5a3a24", alt: "#4a2e1b" },
    wetFloor: { kind: "terrazzo", base: "#efe9e0", alt: "#2f5e4e" },
    wall: "#e9e2d6",
    feature: { treatment: "fluted", color: "#1f4a3d" },
    wood: "#3d2a1a",
    woodDark: "#1b1410",
    fabric: "#1f4a3d",
    fabricAlt: "#d9b98c",
    accent: "#c9a45a",
    metal: "#c9a45a",
    metalRough: 0.2,
    counter: "#141414",
    cabinet: "#1f2a26",
    rug: "#2b2b2b",
    curtains: "#1f4a3d",
    bed: "channel",
    sofa: "curved",
    legs: "brass",
    ceiling: "tray",
    fixture: "globe",
    decor: 2,
  }),
  mid_century: T({
    id: "mid_century",
    label: "Mid-century",
    blurb: "Teak, mustard and teal, tapered legs, retro shapes",
    floor: { kind: "herringbone", base: "#a0703f", alt: "#8a5c30" },
    wetFloor: { kind: "terrazzo", base: "#eae3d6", alt: "#c46a3c" },
    wall: "#f1ebe0",
    feature: { treatment: "slats", color: "#8a5a30" },
    wood: "#8a5a30",
    woodDark: "#4e3219",
    fabric: "#d9a441",
    fabricAlt: "#2f6b6b",
    accent: "#c46a3c",
    metal: "#c9a45a",
    metalRough: 0.35,
    counter: "#f2ede4",
    cabinet: "#8a5a30",
    rug: "#e8dcc6",
    curtains: "#e8dcc6",
    bed: "panel",
    sofa: "track",
    legs: "wood",
    ceiling: "plain",
    fixture: "globe",
    decor: 2,
  }),
  boho: T({
    id: "boho",
    label: "Boho",
    blurb: "Rattan, terracotta, plants, layered rugs, relaxed",
    floor: { kind: "tile", base: "#c98a6a", alt: "#b97a5a" },
    wetFloor: { kind: "terrazzo", base: "#efe6d6", alt: "#c98a6a" },
    wall: "#f3ebdf",
    feature: { treatment: "paint", color: "#c98a6a" },
    wood: "#b08a5e",
    woodDark: "#6b4a2e",
    fabric: "#eadfcd",
    fabricAlt: "#b5694a",
    accent: "#6b8e5a",
    metal: "#8a6a3a",
    metalRough: 0.5,
    counter: "#efe6d6",
    cabinet: "#d9c3a0",
    rug: "#b5694a",
    curtains: "#efe6d6",
    bed: "slatted",
    sofa: "low",
    legs: "wood",
    ceiling: "rafters",
    fixture: "rattan",
    decor: 3,
  }),
  traditional: T({
    id: "traditional",
    label: "Traditional",
    blurb: "Dark teak, maroon and gold, carved and rich",
    floor: { kind: "wood", base: "#8a5a35", alt: "#744a2a" },
    wetFloor: { kind: "tile", base: "#d9cbb3", alt: "#c9b89c" },
    wall: "#ecdcc0",
    feature: { treatment: "moulding", color: "#8c2f2a" },
    wood: "#5c3a1e",
    woodDark: "#3a2312",
    fabric: "#8c2f2a",
    fabricAlt: "#c9962e",
    accent: "#c9962e",
    metal: "#b88a3e",
    metalRough: 0.3,
    counter: "#3b2f27",
    cabinet: "#6b4426",
    rug: "#9a3b2e",
    curtains: "#8c2f2a",
    bed: "wingback",
    sofa: "tufted",
    legs: "wood",
    ceiling: "rafters",
    fixture: "chandelier",
    decor: 3,
  }),
  industrial: T({
    id: "industrial",
    label: "Industrial",
    blurb: "Concrete, exposed brick, leather, black steel",
    floor: { kind: "concrete", base: "#9d9a94", alt: "#8b8882" },
    wetFloor: { kind: "tile", base: "#7d7b78", alt: "#6f6d6a" },
    wall: "#d8d4ce",
    feature: { treatment: "stone", color: "#a5644a" },
    wood: "#6b4a32",
    woodDark: "#3d2b1e",
    fabric: "#7a4a2a",
    fabricAlt: "#4a4a48",
    accent: "#3d5a4a",
    metal: "#232323",
    metalRough: 0.55,
    counter: "#5a5856",
    cabinet: "#3c3c3a",
    rug: "#7d7468",
    curtains: "#8b8882",
    bed: "platform",
    sofa: "boxy",
    legs: "metal",
    ceiling: "rafters",
    fixture: "pendant",
    decor: 1,
  }),
  coastal: T({
    id: "coastal",
    label: "Coastal",
    blurb: "Whitewashed wood, sea blues, linen, airy",
    floor: { kind: "wood", base: "#e6dccb", alt: "#d9ccb6" },
    wetFloor: { kind: "tile", base: "#e8eef0", alt: "#d5dfe3" },
    wall: "#f3f1ea",
    feature: { treatment: "slats", color: "#e6e1d6" },
    wood: "#c9b48f",
    woodDark: "#8d7a5a",
    fabric: "#f0ece4",
    fabricAlt: "#4f86a6",
    accent: "#4f86a6",
    metal: "#d9d4ca",
    metalRough: 0.4,
    counter: "#f5f3ee",
    cabinet: "#eef1ef",
    rug: "#d9e2e4",
    curtains: "#f5f3ee",
    bed: "slatted",
    sofa: "track",
    legs: "wood",
    ceiling: "plain",
    fixture: "rattan",
    decor: 2,
  }),
};
export const THEME_IDS = Object.keys(THEMES);

// ---------- moods ----------

export const MOODS = {
  morning: { label: "Bright morning", sun: { color: "#fff6ea", intensity: 2.6, elevation: 0.95, azimuth: -0.6 }, hemi: { sky: "#fffaf2", ground: "#b9a88f", intensity: 0.95 }, env: 0.6, exposure: 1.1, bg: "#f3eee6", lamps: 0, curtains: "open" },
  golden: { label: "Golden hour", sun: { color: "#ffb36b", intensity: 3.0, elevation: 0.32, azimuth: 0.9 }, hemi: { sky: "#ffe1bd", ground: "#8a6a4a", intensity: 0.55 }, env: 0.4, exposure: 1.05, bg: "#f2dcc2", lamps: 0.35, curtains: "open" },
  evening: { label: "Cozy evening", sun: { color: "#ffcf9a", intensity: 0.6, elevation: 0.2, azimuth: 1.3 }, hemi: { sky: "#e8c9a6", ground: "#4a3a2c", intensity: 0.35 }, env: 0.25, exposure: 1.15, bg: "#3a2c26", lamps: 1, curtains: "drawn" },
  night: { label: "Night luxe", sun: { color: "#9fb4ff", intensity: 0.15, elevation: 0.8, azimuth: 0 }, hemi: { sky: "#4a5a7a", ground: "#1a1a22", intensity: 0.2 }, env: 0.3, exposure: 1.2, bg: "#141824", lamps: 1.3, curtains: "open" },
  moody: { label: "Moody", sun: { color: "#ffe2c2", intensity: 1.4, elevation: 0.5, azimuth: 0.4 }, hemi: { sky: "#c9c0b5", ground: "#2a2420", intensity: 0.25 }, env: 0.2, exposure: 0.95, bg: "#2a2622", lamps: 0.7, curtains: "open" },
} as const;
export type MoodId = keyof typeof MOODS;
export type Mood = (typeof MOODS)[MoodId];
export const MOOD_IDS = Object.keys(MOODS) as MoodId[];

// ---------- the look of one design ----------

export type RoomStyle = Partial<Pick<Theme, "floor" | "wall" | "feature" | "wood" | "woodDark" | "fabric" | "fabricAlt" | "accent" | "metal" | "rug" | "curtains" | "cabinet" | "counter" | "bed" | "sofa" | "legs" | "ceiling" | "fixture">> & {
  /** Reference pictures (e.g. from Pinterest) and what Claude saw in them. */
  refs?: { url: string; note?: string }[];
};
export type Shot = { id: string; name: string; url?: string; cam: { p: [number, number, number]; t: [number, number, number]; fov: number; walk: boolean }; mood: MoodId };
export type Look = { theme: string; custom?: Theme; mood: MoodId; rooms: Record<string, RoomStyle>; shots: Shot[] };

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => ((list as readonly string[]).includes(String(v)) ? (v as T) : undefined);
const safeUrl = (u: unknown) => (typeof u === "string" && u.length < 600 && (u.startsWith("/files/") || u.startsWith("/uploads/") || u.startsWith("https://")) ? u : undefined);

function cleanFinish(v: unknown, d?: Finish): Finish | undefined {
  const o = v as Record<string, unknown> | undefined;
  if (!o || typeof o !== "object") return d;
  const kind = oneOf(FINISH_KINDS, o.kind) ?? d?.kind;
  if (!kind) return d;
  return { kind, base: hex(o.base, d?.base ?? "#c9a77c"), alt: hex(o.alt, d?.alt ?? hex(o.base, "#b48f63")) };
}
function cleanFeature(v: unknown, d?: FeatureWall): FeatureWall | undefined {
  const o = v as Record<string, unknown> | undefined;
  if (!o || typeof o !== "object") return d;
  const treatment = oneOf(FEATURE_TREATMENTS, o.treatment) ?? d?.treatment;
  if (!treatment) return d;
  const f: FeatureWall = { treatment, color: hex(o.color, d?.color ?? "#8a6a4a") };
  const p = safeUrl(o.pattern);
  if (p) f.pattern = p;
  return f;
}

/** Cleans a room's overrides (only known fields, valid colours). */
export function cleanRoomStyle(v: unknown): RoomStyle {
  const o = (v ?? {}) as Record<string, unknown>;
  const out: RoomStyle = {};
  const fl = cleanFinish(o.floor);
  if (fl) out.floor = fl;
  const fe = cleanFeature(o.feature);
  if (fe) out.feature = fe;
  for (const k of ["wall", "wood", "woodDark", "fabric", "fabricAlt", "accent", "metal", "rug", "curtains", "cabinet", "counter"] as const) if (typeof o[k] === "string" && HEX.test(o[k] as string)) out[k] = (o[k] as string).toLowerCase();
  const b = oneOf(BED_STYLES, o.bed);
  if (b) out.bed = b;
  const s = oneOf(SOFA_STYLES, o.sofa);
  if (s) out.sofa = s;
  const l = oneOf(LEG_STYLES, o.legs);
  if (l) out.legs = l;
  const c = oneOf(CEILING_STYLES, o.ceiling);
  if (c) out.ceiling = c;
  const fx = oneOf(FIXTURE_STYLES, o.fixture);
  if (fx) out.fixture = fx;
  if (Array.isArray(o.refs))
    out.refs = o.refs
      .map((r: Record<string, unknown>) => ({ url: safeUrl(r?.url), note: typeof r?.note === "string" ? r.note.slice(0, 400) : undefined }))
      .filter((r): r is { url: string; note: string | undefined } => !!r.url)
      .slice(0, 12)
      .map((r) => (r.note ? r : { url: r.url }));
  return out;
}

/** Cleans a whole theme (custom themes made from mood boards). */
export function cleanTheme(v: unknown, fallback: Theme = THEMES.modern): Theme {
  const o = (v ?? {}) as Record<string, unknown>;
  const rs = cleanRoomStyle(o);
  return {
    ...fallback,
    ...rs,
    id: typeof o.id === "string" && /^[\w:-]{1,60}$/.test(o.id) ? o.id : fallback.id,
    label: typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 40) : fallback.label,
    blurb: typeof o.blurb === "string" ? o.blurb.slice(0, 160) : fallback.blurb,
    wetFloor: cleanFinish(o.wetFloor, fallback.wetFloor)!,
    metalRough: typeof o.metalRough === "number" && o.metalRough >= 0 && o.metalRough <= 1 ? o.metalRough : fallback.metalRough,
    decor: typeof o.decor === "number" ? Math.max(0, Math.min(3, Math.round(o.decor))) : fallback.decor,
  } as Theme;
}

export function normaliseLook(raw: unknown, fallbackTheme = "modern"): Look {
  const o = (raw ?? {}) as Record<string, unknown>;
  const theme = typeof o.theme === "string" && (THEMES[o.theme] || o.theme.startsWith("custom:")) ? o.theme : THEMES[fallbackTheme] ? fallbackTheme : "modern";
  const look: Look = {
    theme,
    mood: oneOf(MOOD_IDS, o.mood) ?? "morning",
    rooms: {},
    shots: [],
  };
  if (theme.startsWith("custom:") && o.custom) look.custom = cleanTheme(o.custom);
  if (theme.startsWith("custom:") && !look.custom) look.theme = "modern";
  if (o.rooms && typeof o.rooms === "object")
    for (const [name, st] of Object.entries(o.rooms as Record<string, unknown>).slice(0, 60)) {
      const c = cleanRoomStyle(st);
      if (Object.keys(c).length) look.rooms[name.slice(0, 40)] = c;
    }
  if (Array.isArray(o.shots))
    look.shots = o.shots
      .map((s: Record<string, unknown>) => {
        const cam = s?.cam as Record<string, unknown> | undefined;
        const v3 = (a: unknown) => (Array.isArray(a) && a.length === 3 && a.every((n) => typeof n === "number" && Number.isFinite(n)) ? (a as [number, number, number]) : null);
        const p = v3(cam?.p),
          t = v3(cam?.t);
        if (!p || !t) return null;
        return {
          id: typeof s.id === "string" ? s.id.slice(0, 40) : Math.random().toString(36).slice(2, 10),
          name: typeof s.name === "string" ? s.name.slice(0, 60) : "Shot",
          url: safeUrl(s.url),
          cam: { p, t, fov: typeof cam?.fov === "number" ? Math.max(20, Math.min(100, cam.fov)) : 60, walk: !!cam?.walk },
          mood: oneOf(MOOD_IDS, s.mood) ?? look.mood,
        } as Shot;
      })
      .filter((s): s is Shot => !!s)
      .slice(0, 40);
  return look;
}

/** The base theme of a look. */
export function lookTheme(look: Look): Theme {
  return look.custom ?? THEMES[look.theme] ?? THEMES.modern;
}
/** The theme for one room: the base theme with that room's overrides on top. */
export function roomTheme(look: Look, room: string): Theme {
  const base = lookTheme(look);
  const st = look.rooms[room];
  if (!st) return base;
  const { refs: _refs, ...rest } = st;
  return { ...base, ...rest, id: `${base.id}|${room}` };
}
