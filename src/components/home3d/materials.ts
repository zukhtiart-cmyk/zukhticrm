import * as THREE from "three";
import type { RoomType } from "@/lib/home-scene";
import type { Finish, Theme } from "@/lib/themes";

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

function herringbone(base: string, alt: string) {
  return canvasTexture((g, n) => {
    const r = rand(13);
    g.fillStyle = shade(base, -0.08);
    g.fillRect(0, 0, n, n);
    const L = n / 4,
      W = L / 4;
    g.lineWidth = 1.5;
    for (let row = -2; row < 10; row++)
      for (let col = -2; col < 10; col++) {
        const x = col * L,
          y = row * L * 0.5 + col * L * 0.5;
        for (const flip of [0, 1]) {
          g.save();
          g.translate(x + (flip ? W * 2 : 0), y + (flip ? 0 : 0));
          g.rotate(flip ? -Math.PI / 4 : Math.PI / 4);
          g.fillStyle = shade(r() > 0.5 ? base : alt, (r() - 0.5) * 0.06);
          g.fillRect(0, 0, L * 0.7, W * 0.7);
          g.strokeStyle = "rgba(0,0,0,0.18)";
          g.strokeRect(0, 0, L * 0.7, W * 0.7);
          g.restore();
        }
      }
  }, 1.2);
}

function terrazzo(base: string, chip: string) {
  return canvasTexture((g, n) => {
    const r = rand(21);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    const chips = [chip, shade(chip, 0.15), shade(base, -0.25), "#ffffff", shade(chip, -0.15)];
    for (let i = 0; i < 900; i++) {
      g.fillStyle = chips[Math.floor(r() * chips.length)];
      g.globalAlpha = 0.6 + r() * 0.4;
      g.beginPath();
      const x = r() * n,
        y = r() * n,
        s = 1.5 + r() * (r() > 0.9 ? 10 : 4);
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) g.lineTo(x + Math.cos(k * 1.3 + r()) * s, y + Math.sin(k * 1.3 + r()) * s);
      g.fill();
    }
    g.globalAlpha = 1;
  }, 1.0);
}

function slats(base: string) {
  return canvasTexture((g, n) => {
    g.fillStyle = shade(base, -0.28);
    g.fillRect(0, 0, n, n);
    const k = 12,
      s = n / k;
    for (let i = 0; i < k; i++) {
      const grd = g.createLinearGradient(i * s, 0, i * s + s * 0.7, 0);
      grd.addColorStop(0, shade(base, -0.03));
      grd.addColorStop(1, shade(base, 0.04));
      g.fillStyle = grd;
      g.fillRect(i * s + s * 0.15, 0, s * 0.7, n);
    }
  }, 0.6);
}

function moulding(base: string) {
  return canvasTexture((g, n) => {
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    const m = n * 0.1;
    for (const [lw, col, off] of [
      [6, shade(base, -0.1), 0],
      [3, shade(base, 0.08), 4],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.strokeRect(m + off, m + off, n - 2 * (m + off), n - 2 * (m + off));
    }
  }, 1.0);
}

function stone(base: string) {
  return canvasTexture((g, n) => {
    const r = rand(17);
    g.fillStyle = shade(base, -0.25);
    g.fillRect(0, 0, n, n);
    let y = 0;
    while (y < n) {
      const h = 18 + r() * 26;
      let x = -r() * 60;
      while (x < n) {
        const w = 40 + r() * 90;
        g.fillStyle = shade(base, (r() - 0.5) * 0.16);
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        x += w;
      }
      y += h;
    }
  }, 1.2);
}

function wallpaper(base: string) {
  return canvasTexture((g, n) => {
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = shade(base, 0.18);
    g.lineWidth = 3;
    const k = 4,
      s = n / k;
    for (let i = 0; i <= k; i++)
      for (let j = 0; j <= k; j++) {
        const x = i * s,
          y = j * s;
        g.beginPath();
        g.moveTo(x, y - s * 0.35);
        g.quadraticCurveTo(x + s * 0.3, y, x, y + s * 0.35);
        g.quadraticCurveTo(x - s * 0.3, y, x, y - s * 0.35);
        g.stroke();
        g.beginPath();
        g.arc(x + s / 2, y + s / 2, s * 0.06, 0, Math.PI * 2);
        g.fillStyle = shade(base, 0.22);
        g.fill();
      }
  }, 0.6);
}

/** A texture from a picture (e.g. a wallpaper pattern from Pinterest), repeated every `metres`. */
function imageTexture(url: string, metres = 0.8) {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.metres = metres;
  return t;
}

function finishTexture(f: Finish) {
  switch (f.kind) {
    case "wood":
      return wood(f.base, f.alt);
    case "herringbone":
      return herringbone(f.base, f.alt);
    case "marble":
      return marble(f.base, f.alt);
    case "concrete":
      return concrete(f.base, f.alt);
    case "terrazzo":
      return terrazzo(f.base, f.alt);
    default:
      return tiles(f.base, f.alt);
  }
}
const finishRough = (f: Finish) => (f.kind === "marble" ? 0.15 : f.kind === "terrazzo" ? 0.3 : f.kind === "tile" ? 0.4 : f.kind === "concrete" ? 0.7 : 0.55);

export type Mats = ReturnType<typeof makeMaterials>;

/** Every material the house needs, for one theme (a room's theme includes its own overrides). */
export function makeMaterials(p: Theme) {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const fw = p.feature;
  const featureMap =
    fw.pattern ? imageTexture(fw.pattern) : fw.treatment === "fluted" ? fluted(fw.color) : fw.treatment === "slats" ? slats(fw.color) : fw.treatment === "moulding" ? moulding(fw.color) : fw.treatment === "stone" ? stone(fw.color) : fw.treatment === "marble" ? marble(fw.color, shade(fw.color, -0.3)) : fw.treatment === "wallpaper" ? wallpaper(fw.color) : null;
  return {
    kit: p,
    floor: std({ map: finishTexture(p.floor), roughness: finishRough(p.floor), metalness: 0 }),
    wetFloor: std({ map: finishTexture(p.wetFloor), roughness: finishRough(p.wetFloor) }),
    deck: std({ map: wood(shade(p.wood, 0.05), p.wood), roughness: 0.7 }),
    wall: std({ color: p.wall, roughness: 0.92 }),
    wallCap: std({ color: "#3a3631", roughness: 0.9 }),
    accentWall: std({ color: fw.treatment === "paint" ? fw.color : p.wall, roughness: 0.85 }),
    feature: featureMap ? std({ map: featureMap, roughness: fw.treatment === "marble" ? 0.2 : 0.6 }) : std({ color: fw.color, roughness: 0.85 }),
    fluted: std({ map: fluted(p.wood), roughness: 0.6 }),
    ceiling: std({ color: "#fbfaf8", emissive: "#f6f1e8", emissiveIntensity: 0.55, roughness: 0.95, side: THREE.DoubleSide }),
    wood: std({ color: p.wood, roughness: 0.55 }),
    woodDark: std({ color: p.woodDark, roughness: 0.5 }),
    fabric: std({ map: weave(p.fabric), roughness: 0.95 }),
    fabricAlt: std({ map: weave(p.fabricAlt), roughness: 0.95 }),
    velvet: new THREE.MeshPhysicalMaterial({ color: p.fabric, roughness: 0.85, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(shade(p.fabric, 0.25)) }),
    linen: std({ map: weave("#f4f1ea"), roughness: 0.95 }),
    curtain: std({ map: weave(p.curtains), roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    sheer: std({ color: "#fbf8f2", roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.45 }),
    accent: std({ color: p.accent, roughness: 0.6 }),
    metal: std({ color: p.metal, roughness: p.metalRough, metalness: 0.85 }),
    legs: p.legs === "brass" ? std({ color: "#c8a25a", roughness: 0.3, metalness: 0.9 }) : p.legs === "metal" ? std({ color: "#1d1d1d", roughness: 0.45, metalness: 0.8 }) : std({ color: p.woodDark, roughness: 0.5 }),
    chrome: std({ color: "#e6e6e6", roughness: 0.15, metalness: 1 }),
    counter: std({ color: p.counter, roughness: 0.25 }),
    cabinet: std({ color: p.cabinet, roughness: 0.5 }),
    ceramic: std({ color: "#fbfbfa", roughness: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#dfeef2", roughness: 0.05, transmission: 0.85, thickness: 0.02, transparent: true, opacity: 0.35 }),
    screen: std({ color: "#0d0f12", roughness: 0.15, metalness: 0.3 }),
    leaf: std({ color: "#4f6b3a", roughness: 0.8 }),
    leafDark: std({ color: "#365029", roughness: 0.8 }),
    pot: std({ color: "#d9cbb6", roughness: 0.8 }),
    rattan: std({ map: weave("#c4a477"), roughness: 0.9 }),
    rug: std({ map: rugPattern(p.rug, p.accent), roughness: 1 }),
    light: Object.assign(new THREE.MeshStandardMaterial({ color: "#fff4dc", emissive: "#ffe2b0", emissiveIntensity: 1.6 }), { userData: { lamp: true } }),
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
