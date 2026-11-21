import { ROOM_LABELS, type HomeScene } from "./home-scene";
import { MOODS, STYLE_LABELS, lookTheme, roomTheme, type Look, type Shot, type Theme } from "./themes";

/** Designer colour names, so the picture AI gets "emerald" instead of "#1f4a3d". */
const NAMES: [string, string][] = [
  ["white", "#f8f8f6"],
  ["warm white", "#f3eee6"],
  ["ivory", "#efe8da"],
  ["cream", "#ece2cc"],
  ["beige", "#dccbb0"],
  ["greige", "#c9bfb2"],
  ["light grey", "#cfcfcf"],
  ["grey", "#9a9a9a"],
  ["charcoal", "#3e3e3e"],
  ["black", "#161616"],
  ["taupe", "#9c8a78"],
  ["sand", "#d2b98f"],
  ["camel", "#b9905b"],
  ["light oak", "#d6bb8f"],
  ["oak", "#b48a5a"],
  ["teak", "#8a5a30"],
  ["walnut", "#5a3a24"],
  ["dark walnut", "#33221a"],
  ["espresso", "#2a1c14"],
  ["terracotta", "#b5694a"],
  ["rust", "#a24f2a"],
  ["burnt orange", "#c46a3c"],
  ["mustard", "#d4a23a"],
  ["gold", "#c9a45a"],
  ["blush pink", "#e3b8ae"],
  ["dusty rose", "#c48b85"],
  ["maroon", "#7a2a26"],
  ["burgundy", "#6e1f2e"],
  ["sage green", "#9aac8c"],
  ["olive green", "#6b7a4a"],
  ["forest green", "#2f4f34"],
  ["emerald green", "#1f5a45"],
  ["bottle green", "#1d3b31"],
  ["teal", "#2f6b6b"],
  ["duck-egg blue", "#a9c6c9"],
  ["powder blue", "#a9c3d6"],
  ["dusty blue", "#7d9bb0"],
  ["denim blue", "#4f6f8f"],
  ["navy", "#24314f"],
  ["ink blue", "#1f2f45"],
  ["lavender", "#b7a9c9"],
  ["plum", "#5e3a55"],
  ["brass", "#c8a25a"],
  ["chrome", "#d9d9d9"],
];
function hexRgb(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const WOODS: [string, string][] = [
  ["whitewashed", "#e6dccb"],
  ["pale ash", "#d8c3a0"],
  ["light oak", "#d6bb8f"],
  ["natural oak", "#c9a77c"],
  ["honey oak", "#b48a5a"],
  ["teak", "#8a5a30"],
  ["walnut", "#5a3a24"],
  ["dark walnut", "#3a2618"],
  ["ebony", "#1f1714"],
  ["grey-washed oak", "#a59a8c"],
];
const METALS: [string, string][] = [
  ["polished brass", "#c8a25a"],
  ["antique brass", "#8a6a3a"],
  ["bronze", "#5e4630"],
  ["matte black", "#1d1d1d"],
  ["gunmetal", "#4a4a4a"],
  ["brushed nickel", "#bdbdbd"],
  ["chrome", "#e3e3e3"],
  ["copper", "#b0643a"],
];
export const woodName = (hex: string) => colorName(hex, WOODS);
export const metalName = (hex: string) => colorName(hex, METALS);
export function colorName(hex: string, list: [string, string][] = NAMES) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [r, g, b] = hexRgb(hex);
  let best = list[0][0],
    bd = Infinity;
  for (const [name, h] of list) {
    const [r2, g2, b2] = hexRgb(h);
    const d = (r - r2) ** 2 * 0.3 + (g - g2) ** 2 * 0.59 + (b - b2) ** 2 * 0.11;
    if (d < bd) (bd = d), (best = name);
  }
  return best;
}

const FINISH: Record<string, string> = { wood: "wooden plank", herringbone: "herringbone wood", marble: "polished marble", tile: "large-format tile", concrete: "seamless microcement", terrazzo: "terrazzo" };
const MOOD_TEXT: Record<string, string> = {
  morning: "bright natural morning daylight streaming through the windows, soft fresh shadows, airy",
  golden: "warm golden-hour sunlight coming in low through the windows, long soft shadows, lamps softly on",
  evening: "cozy evening: curtains drawn, warm lamps, glowing cove lights and pendant lights, intimate warm light",
  night: "night time: dark sky outside the windows, all interior lights on, glowing cove lighting, reflections on glossy surfaces",
  moody: "moody, dramatic light with deep shadows and warm accent lighting",
};

/** The room a shot was taken in (walk-through shots), if any. */
export function shotRoom(scene: HomeScene, shot: Shot) {
  if (!shot.cam.walk) return null;
  const [x, , z] = shot.cam.p;
  return scene.rooms.find((r) => x >= r.x && x <= r.x + r.w && z >= r.y && z <= r.y + r.d) ?? null;
}

function describe(t: Theme, roomType?: string) {
  const parts: string[] = [];
  const woodFloor = t.floor.kind === "wood" || t.floor.kind === "herringbone";
  parts.push(`${woodFloor ? woodName(t.floor.base) : colorName(t.floor.base)} ${FINISH[t.floor.kind] ?? t.floor.kind} floor`);
  parts.push(`${colorName(t.wall)} walls`);
  const fw = t.feature;
  const fwColour = fw.treatment === "fluted" || fw.treatment === "slats" ? woodName(fw.color) : colorName(fw.color);
  const fwText = fw.pattern ? "patterned wallpaper feature wall (as in the reference)" : fw.treatment === "paint" ? `${colorName(fw.color)} painted accent wall` : `${fwColour} ${STYLE_LABELS[fw.treatment]?.toLowerCase() ?? fw.treatment} feature wall`;
  parts.push(fwText);
  if (!roomType || /bedroom/.test(roomType)) parts.push(`${STYLE_LABELS[t.bed]?.toLowerCase()} bed upholstered in ${colorName(t.fabric)}${t.bed === "tufted" || t.bed === "channel" || t.bed === "wingback" ? " velvet" : " fabric"}, ${colorName(t.fabricAlt)} bedding`);
  if (!roomType || /living/.test(roomType)) parts.push(`${STYLE_LABELS[t.sofa]?.toLowerCase()} sofa in ${colorName(t.fabric)}, ${colorName(t.accent)} cushions`);
  parts.push(`${woodName(t.wood)} wood furniture`);
  parts.push(`${colorName(t.cabinet)} cabinetry`);
  parts.push(`${metalName(t.metal)} metal details`);
  if (!roomType || !/bath|powder|kitchen|utility|passage|shaft/.test(roomType)) parts.push(`${colorName(t.curtains)} curtains`, `${colorName(t.rug)} rug`);
  if (roomType === "kitchen") parts.push(`${colorName(t.counter)} countertop`);
  parts.push(`${STYLE_LABELS[t.ceiling]?.toLowerCase()} ceiling`, `${STYLE_LABELS[t.fixture]?.toLowerCase()} ceiling light`);
  return parts.join(", ");
}

/** The instruction for a photo-real picture of a saved shot. */
export function renderPrompt(scene: HomeScene, look: Look, shot: Shot) {
  const room = shotRoom(scene, shot);
  const base = lookTheme(look);
  const t = room ? roomTheme(look, room.name) : base;
  const refs = room ? (look.rooms[room.name]?.refs ?? []).map((r) => r.note?.replace("[pattern] ", "")).filter(Boolean) : [];
  const lines = [
    "Turn this 3D draft into a photorealistic interior photograph. Keep the exact geometry, room layout, furniture positions and camera angle; do not add or remove walls, doors or windows.",
    room ? `Room: ${room.name} (${ROOM_LABELS[room.type].toLowerCase()}).` : "View: a 3D cut-away dollhouse view of the whole apartment from above; keep it a cut-away.",
    `Style: ${base.label} — ${base.blurb}.`,
    `Materials and colours: ${describe(t, room?.type)}.`,
    refs.length ? `Match these references: ${refs.slice(0, 4).join(" ")}` : "",
    `Lighting: ${MOOD_TEXT[shot.mood] ?? MOODS[shot.mood].label}.`,
    "Professional architectural interior photography, wide-angle lens, real material textures, soft global illumination, crisp detail, no people, no text.",
  ];
  return lines.filter(Boolean).join(" ");
}
