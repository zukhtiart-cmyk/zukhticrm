import * as THREE from "three";
import type { InteriorStyle, RoomType } from "@/lib/home-scene";

/** Colours and finishes for each interior style. */
export type Palette = {
  label: string;
  floor: { kind: "wood" | "marble" | "concrete" | "tile"; base: string; alt: string };
  wetFloor: { kind: "tile" | "marble"; base: string; alt: string };
  wall: string;
  accentWall: string;
  wood: string;
  woodDark: string;
  fabric: string;
  fabricAlt: string;
  accent: string;
  metal: string;
  metalRough: number;
  counter: string;
  rug: string;
  cabinet: string;
};

export const PALETTES: Record<InteriorStyle, Palette> = {
  modern: {
    label: "Modern",
    floor: { kind: "wood", base: "#c9a77c", alt: "#b48f63" },
    wetFloor: { kind: "tile", base: "#c9c5bd", alt: "#bdb8af" },
    wall: "#efe9e1",
    accentWall: "#3f4954",
    wood: "#8a6a4a",
    woodDark: "#4b3a2c",
    fabric: "#b9b3aa",
    fabricAlt: "#5e6a73",
    accent: "#c46a3c",
    metal: "#2a2a2a",
    metalRough: 0.4,
    counter: "#e9e6e1",
    rug: "#d8d0c4",
    cabinet: "#f1eee9",
  },
  luxury: {
    label: "Luxury",
    floor: { kind: "marble", base: "#f2eee8", alt: "#b9b2a8" },
    wetFloor: { kind: "marble", base: "#e9e3da", alt: "#a89f92" },
    wall: "#e8dfd2",
    accentWall: "#5b4636",
    wood: "#5a3a24",
    woodDark: "#2e1e14",
    fabric: "#24414f",
    fabricAlt: "#d9cbb5",
    accent: "#2f5e4e",
    metal: "#c8a25a",
    metalRough: 0.25,
    counter: "#1f1f1f",
    rug: "#cbbba3",
    cabinet: "#3a2c22",
  },
  japandi: {
    label: "Japandi",
    floor: { kind: "wood", base: "#d8c3a0", alt: "#c7ae86" },
    wetFloor: { kind: "tile", base: "#cfc6b8", alt: "#c2b8a8" },
    wall: "#ece4d8",
    accentWall: "#b8a58a",
    wood: "#a07850",
    woodDark: "#5c4a3a",
    fabric: "#d9cfc0",
    fabricAlt: "#6b7a5e",
    accent: "#5b6b4f",
    metal: "#1d1d1d",
    metalRough: 0.6,
    counter: "#e4ddd2",
    rug: "#cfc3ae",
    cabinet: "#c9b08e",
  },
  minimalist: {
    label: "Minimalist",
    floor: { kind: "concrete", base: "#d3cfc8", alt: "#c4bfb7" },
    wetFloor: { kind: "tile", base: "#d6d3ce", alt: "#cbc8c2" },
    wall: "#f4f2ee",
    accentWall: "#dedad3",
    wood: "#d1b38a",
    woodDark: "#8c7458",
    fabric: "#e5e1da",
    fabricAlt: "#a7a39c",
    accent: "#8e8a83",
    metal: "#bdbdbd",
    metalRough: 0.35,
    counter: "#f2f0ec",
    rug: "#e6e1d8",
    cabinet: "#f3f1ed",
  },
  scandinavian: {
    label: "Scandinavian",
    floor: { kind: "wood", base: "#e2cfae", alt: "#d4be98" },
    wetFloor: { kind: "tile", base: "#e4e2dd", alt: "#d8d5cf" },
    wall: "#f6f4f0",
    accentWall: "#9fb3bf",
    wood: "#e0c49a",
    woodDark: "#9c7c55",
    fabric: "#c9ced2",
    fabricAlt: "#7d9bb0",
    accent: "#e2b34a",
    metal: "#2b2b2b",
    metalRough: 0.5,
    counter: "#f4f3f0",
    rug: "#ece8e1",
    cabinet: "#f6f5f2",
  },
  traditional: {
    label: "Traditional",
    floor: { kind: "wood", base: "#8a5a35", alt: "#744a2a" },
    wetFloor: { kind: "tile", base: "#d9cbb3", alt: "#c9b89c" },
    wall: "#ecdcc0",
    accentWall: "#8c2f2a",
    wood: "#5c3a1e",
    woodDark: "#3a2312",
    fabric: "#8c2f2a",
    fabricAlt: "#c9962e",
    accent: "#c9962e",
    metal: "#b88a3e",
    metalRough: 0.3,
    counter: "#3b2f27",
    rug: "#9a3b2e",
    cabinet: "#6b4426",
  },
  industrial: {
    label: "Industrial",
    floor: { kind: "concrete", base: "#9d9a94", alt: "#8b8882" },
    wetFloor: { kind: "tile", base: "#7d7b78", alt: "#6f6d6a" },
    wall: "#d8d4ce",
    accentWall: "#a5644a",
    wood: "#6b4a32",
    woodDark: "#3d2b1e",
    fabric: "#7a4a2a",
    fabricAlt: "#4a4a48",
    accent: "#3d5a4a",
    metal: "#232323",
    metalRough: 0.55,
    counter: "#5a5856",
    rug: "#7d7468",
    cabinet: "#3c3c3a",
  },
  coastal: {
    label: "Coastal",
    floor: { kind: "wood", base: "#e6dccb", alt: "#d9ccb6" },
    wetFloor: { kind: "tile", base: "#e8eef0", alt: "#d5dfe3" },
    wall: "#f3f1ea",
    accentWall: "#a9c6d3",
    wood: "#c9b48f",
    woodDark: "#8d7a5a",
    fabric: "#f0ece4",
    fabricAlt: "#4f86a6",
    accent: "#4f86a6",
    metal: "#d9d4ca",
    metalRough: 0.4,
    counter: "#f5f3ee",
    rug: "#d9e2e4",
    cabinet: "#eef1ef",
  },
};

const WET = new Set<RoomType>(["bathroom", "powder", "utility", "balcony"]);
export const isWet = (t: RoomType) => WET.has(t);

// ---------- procedural textures ----------

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function shade(hex: string, f: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, f);
  return `#${c.getHexString()}`;
}

/** One square texture tile; `size` is how many metres it covers. */
function canvasTexture(draw: (g: CanvasRenderingContext2D, n: number) => void, metres: number) {
  const n = 512;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  draw(c.getContext("2d")!, n);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.metres = metres;
  return t;
}

function wood(base: string, alt: string) {
  return canvasTexture((g, n) => {
    const r = rand(7);
    const rows = 8; // planks ~0.2 m wide over 1.6 m
    const h = n / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * n;
      while (x < n) {
        const len = n * (0.45 + r() * 0.5);
        g.fillStyle = shade(r() > 0.5 ? base : alt, (r() - 0.5) * 0.06);
        g.fillRect(x, i * h, len, h);
        g.strokeStyle = "rgba(0,0,0,0.05)";
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          const y = i * h + r() * h;
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.6, y + (r() - 0.5) * 6, x + len, y);
          g.stroke();
        }
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.fillRect(x, i * h, 1.5, h);
        x += len;
      }
      g.fillStyle = "rgba(0,0,0,0.16)";
      g.fillRect(0, i * h, n, 1.5);
    }
  }, 1.6);
}

function marble(base: string, vein: string) {
  return canvasTexture((g, n) => {
    const r = rand(11);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = vein;
      g.globalAlpha = 0.06 + r() * 0.18;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      let x = r() * n,
        y = r() * n;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.3) * 140;
        y += (r() - 0.5) * 140;
        g.quadraticCurveTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 80, x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(0,0,0,0.07)";
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, n - 1, n - 1);
  }, 1.2);
}

function tiles(base: string, alt: string, metres = 0.6) {
  return canvasTexture((g, n) => {
    const r = rand(3);
    const k = 2;
    const s = n / k;
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++) {
        g.fillStyle = shade(r() > 0.5 ? base : alt, (r() - 0.5) * 0.03);
        g.fillRect(i * s, j * s, s, s);
      }
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 3;
    for (let i = 0; i <= k; i++) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, n);
      g.moveTo(0, i * s);
      g.lineTo(n, i * s);
      g.stroke();
    }
  }, metres * 2);
}

function concrete(base: string, alt: string) {
  return canvasTexture((g, n) => {
    const r = rand(5);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() > 0.5 ? alt : shade(base, 0.04);
      g.globalAlpha = 0.08 + r() * 0.12;
      const s = 2 + r() * 14;
      g.beginPath();
      g.arc(r() * n, r() * n, s, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }, 2.4);
}

function fluted(base: string) {
  return canvasTexture((g, n) => {
    const k = 24;
    const s = n / k;
    for (let i = 0; i < k; i++) {
      const grd = g.createLinearGradient(i * s, 0, (i + 1) * s, 0);
      grd.addColorStop(0, shade(base, -0.06));
      grd.addColorStop(0.5, shade(base, 0.05));
      grd.addColorStop(1, shade(base, -0.08));
      g.fillStyle = grd;
      g.fillRect(i * s, 0, s, n);
    }
  }, 0.72);
}

function weave(base: string) {
  return canvasTexture((g, n) => {
    const r = rand(9);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < n; i += 4) {
      g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.04})`;
      g.fillRect(0, i, n, 2);
      g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`;
      g.fillRect(i, 0, 2, n);
    }
  }, 0.5);
}

function rugPattern(base: string, line: string) {
  return canvasTexture((g, n) => {
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = line;
    g.globalAlpha = 0.35;
    g.lineWidth = 10;
    g.strokeRect(26, 26, n - 52, n - 52);
    g.lineWidth = 3;
    g.strokeRect(52, 52, n - 104, n - 104);
    g.globalAlpha = 0.08;
    for (let i = 0; i < n; i += 6) {
      g.fillStyle = i % 12 ? "#000" : "#fff";
      g.fillRect(0, i, n, 3);
    }
    g.globalAlpha = 1;
  }, 1);
}

export type Mats = ReturnType<typeof makeMaterials>;

/** Every material the house needs, for one style. */
export function makeMaterials(p: Palette) {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const floorTex = p.floor.kind === "wood" ? wood(p.floor.base, p.floor.alt) : p.floor.kind === "marble" ? marble(p.floor.base, p.floor.alt) : p.floor.kind === "concrete" ? concrete(p.floor.base, p.floor.alt) : tiles(p.floor.base, p.floor.alt);
  const wetTex = p.wetFloor.kind === "marble" ? marble(p.wetFloor.base, p.wetFloor.alt) : tiles(p.wetFloor.base, p.wetFloor.alt, 0.6);
  const deckTex = wood(shade(p.wood, 0.05), p.wood);
  return {
    floor: std({ map: floorTex, roughness: p.floor.kind === "marble" ? 0.18 : p.floor.kind === "wood" ? 0.55 : 0.75, metalness: 0 }),
    wetFloor: std({ map: wetTex, roughness: 0.35 }),
    deck: std({ map: deckTex, roughness: 0.7 }),
    wall: std({ color: p.wall, roughness: 0.92 }),
    wallCap: std({ color: "#3a3631", roughness: 0.9 }),
    accentWall: std({ color: p.accentWall, roughness: 0.85 }),
    fluted: std({ map: fluted(p.wood), roughness: 0.6 }),
    ceiling: std({ color: "#fbfaf8", emissive: "#f6f1e8", emissiveIntensity: 0.55, roughness: 0.95, side: THREE.DoubleSide }),
    wood: std({ color: p.wood, roughness: 0.55 }),
    woodDark: std({ color: p.woodDark, roughness: 0.5 }),
    fabric: std({ map: weave(p.fabric), roughness: 0.95 }),
    fabricAlt: std({ map: weave(p.fabricAlt), roughness: 0.95 }),
    linen: std({ map: weave("#f4f1ea"), roughness: 0.95 }),
    accent: std({ color: p.accent, roughness: 0.6 }),
    metal: std({ color: p.metal, roughness: p.metalRough, metalness: 0.85 }),
    chrome: std({ color: "#e6e6e6", roughness: 0.15, metalness: 1 }),
    counter: std({ color: p.counter, roughness: 0.25 }),
    cabinet: std({ color: p.cabinet, roughness: 0.5 }),
    ceramic: std({ color: "#fbfbfa", roughness: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#dfeef2", roughness: 0.05, transmission: 0.85, thickness: 0.02, transparent: true, opacity: 0.35 }),
    screen: std({ color: "#0d0f12", roughness: 0.15, metalness: 0.3 }),
    leaf: std({ color: "#4f6b3a", roughness: 0.8 }),
    leafDark: std({ color: "#365029", roughness: 0.8 }),
    pot: std({ color: "#d9cbb6", roughness: 0.8 }),
    rug: std({ map: rugPattern(p.rug, p.accent), roughness: 1 }),
    light: new THREE.MeshStandardMaterial({ color: "#fff4dc", emissive: "#ffe2b0", emissiveIntensity: 1.6 }),
    art: [p.accent, p.fabricAlt, "#d9b98c", "#8aa2a8"].map((c) => std({ color: c, roughness: 0.8 })),
    frame: std({ color: p.woodDark, roughness: 0.5 }),
    door: std({ color: shade(p.wood, 0.08), roughness: 0.55 }),
    frameLight: std({ color: "#f1efea", roughness: 0.5 }),
    rail: std({ color: "#3a3a3a", roughness: 0.4, metalness: 0.8 }),
    ground: std({ color: "#e9e4dc", roughness: 1 }),
    brass: std({ color: "#c8a25a", roughness: 0.3, metalness: 0.9 }),
    terracotta: std({ color: "#b5694a", roughness: 0.85 }),
  };
}

/** Sets UVs from world size so textures keep their real-world scale on any surface. */
export function worldUV(geo: THREE.BufferGeometry, metres: number, axes: "xz" | "xy" | "zy" = "xz") {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const a = axes === "zy" ? pos.getZ(i) : pos.getX(i);
    const b = axes === "xz" ? pos.getZ(i) : pos.getY(i);
    uv[i * 2] = a / metres;
    uv[i * 2 + 1] = b / metres;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}
