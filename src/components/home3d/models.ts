import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Item } from "./furnish";
import type { Mats } from "./materials";
import { WALL_H } from "@/lib/home-scene";

/**
 * Furniture built from simple shapes. Every model sits on the floor, centred on its footprint,
 * with its front facing +z; w = across the front (x), d = front to back (z).
 */

type M = THREE.Material;
const geoCache = new Map<string, THREE.BufferGeometry>();
function boxGeo(w: number, h: number, d: number, r = 0) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r}`;
  let g = geoCache.get(k);
  if (!g) {
    g = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.999) : new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}
export function clearGeoCache() {
  geoCache.forEach((g) => g.dispose());
  geoCache.clear();
}

function mesh(g: THREE.BufferGeometry, m: M, x: number, y: number, z: number, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}
/** Box with its bottom at y. */
function B(G: THREE.Group, w: number, h: number, d: number, m: M, x = 0, y = 0, z = 0, r = 0) {
  const o = mesh(boxGeo(w, h, d, r), m, x, y + h / 2, z);
  G.add(o);
  return o;
}
function C(G: THREE.Group, rt: number, rb: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 24) {
  const o = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
  G.add(o);
  return o;
}
function S(G: THREE.Group, r: number, m: M, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const o = mesh(new THREE.SphereGeometry(r, 18, 12), m, x, y, z);
  o.scale.set(sx, sy, sz);
  G.add(o);
  return o;
}
function legs(G: THREE.Group, w: number, d: number, h: number, m: M, inset = 0.05, t = 0.04) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(G, t, h, t, m, sx * (w / 2 - inset), 0, sz * (d / 2 - inset));
}

function plant(G: THREE.Group, M: Mats, size: number, x = 0, z = 0) {
  C(G, size * 0.32, size * 0.25, size * 0.55, M.pot, x, 0, z);
  const h = size * 1.6;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const leaf = S(G, size * 0.22, i % 2 ? M.leaf : M.leafDark, x + Math.cos(a) * size * 0.18, size * 0.55 + h * (0.35 + (i % 3) * 0.18), z + Math.sin(a) * size * 0.18, 1, 1.8, 0.5);
    leaf.rotation.set(Math.cos(a) * 0.5, a, Math.sin(a) * 0.5);
  }
}

function lamp(G: THREE.Group, M: Mats, x: number, y: number, z: number) {
  C(G, 0.06, 0.08, 0.04, M.metal, x, y, z);
  C(G, 0.012, 0.012, 0.3, M.metal, x, y + 0.04, z, 8);
  C(G, 0.1, 0.14, 0.18, M.linen, x, y + 0.3, z);
}

const builders: Record<Item["kind"], (G: THREE.Group, it: Item, M: Mats) => void> = {
  bed(G, { w, d, opts }, M) {
    const single = !!opts?.single;
    const style = M.kit.bed;
    const soft = style === "tufted" || style === "channel" || style === "wingback" ? M.velvet : M.fabric;
    if (style === "platform") {
      B(G, w + 0.2, 0.16, d + 0.1, M.wood, 0, 0, -0.02, 0.02); // low wooden platform
      B(G, w - 0.04, 0.22, d - 0.08, M.linen, 0, 0.16, 0.02, 0.06);
      B(G, w + 0.2, 0.5, 0.06, M.wood, 0, 0.16, -d / 2 - 0.05, 0.02);
    } else {
      B(G, w, 0.26, d, M.kit.legs === "plinth" ? M.wood : soft, 0, 0.1, 0, 0.03);
      if (M.kit.legs !== "plinth") legs(G, w, d, 0.1, M.legs, 0.08, 0.05);
      B(G, w - 0.04, 0.22, d - 0.08, M.linen, 0, 0.34, 0.02, 0.06);
    }
    const top = style === "platform" ? 0.38 : 0.56;
    B(G, w + 0.02, 0.06, d * 0.62, M.fabricAlt, 0, top - 0.03, d * 0.17, 0.03); // duvet
    B(G, w + 0.02, 0.025, 0.35, M.accent, 0, top + 0.03, d * 0.38, 0.01); // runner
    const hz = -d / 2 + 0.05;
    if (style === "panel") B(G, w + 0.1, 1.05, 0.1, soft, 0, 0.1, hz, 0.04);
    else if (style === "tufted") {
      B(G, w + 0.12, 1.15, 0.12, soft, 0, 0.1, hz, 0.05);
      for (let i = 0; i < Math.round(w / 0.18); i++) for (let j = 0; j < 4; j++) S(G, 0.012, M.woodDark, -w / 2 + 0.1 + i * 0.18 + (j % 2) * 0.09, 0.55 + j * 0.16, hz + 0.065).castShadow = false;
    } else if (style === "channel") {
      const n = Math.max(5, Math.round(w / 0.16));
      for (let i = 0; i < n; i++) B(G, (w + 0.1) / n - 0.008, 1.1, 0.13, soft, -w / 2 - 0.05 + ((w + 0.1) / n) * (i + 0.5), 0.1, hz, 0.05);
    } else if (style === "wingback") {
      B(G, w + 0.1, 1.35, 0.12, soft, 0, 0.1, hz, 0.05);
      for (const sx of [-1, 1]) B(G, 0.1, 1.2, 0.35, soft, sx * (w / 2 + 0.08), 0.1, hz + 0.12, 0.05);
    } else if (style === "slatted") {
      const n = Math.max(6, Math.round(w / 0.09));
      for (let i = 0; i < n; i++) B(G, 0.05, 1.0, 0.05, M.wood, -w / 2 + (w / (n - 1)) * i, 0.1, hz, 0.01);
      B(G, w + 0.1, 0.05, 0.08, M.wood, 0, 1.1, hz, 0.01);
    }
    const n = single ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const px = n === 1 ? 0 : (i - 0.5) * (w * 0.48);
      const pl = B(G, w / n - 0.12, 0.16, 0.38, M.linen, px, top - 0.01, -d / 2 + 0.35, 0.07);
      pl.rotation.x = -0.25;
    }
    B(G, single ? 0.4 : 0.5, 0.14, 0.12, M.accent, 0, top + 0.02, -d / 2 + 0.55, 0.05).rotation.x = -0.2;
  },
  side_table(G, { w, d }, M) {
    B(G, w, 0.5, d, M.wood, 0, 0.05, 0, 0.02);
    B(G, w - 0.04, 0.005, 0.005, M.metal, 0, 0.32, d / 2);
    legs(G, w, d, 0.05, M.metal, 0.04, 0.03);
    lamp(G, M, 0.05, 0.55, -0.03);
  },
  wardrobe(G, { w, d }, M) {
    const h = 2.4;
    B(G, w, h, d, M.cabinet, 0, 0, 0, 0.01);
    const doors = Math.max(2, Math.round(w / 0.55));
    const dw = w / doors;
    for (let i = 0; i < doors; i++) {
      const x = -w / 2 + dw * (i + 0.5);
      B(G, dw - 0.008, h - 0.04, 0.012, M.cabinet, x, 0.02, d / 2 + 0.006, 0.004);
      B(G, 0.015, 0.35, 0.02, M.metal, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), 0.95, d / 2 + 0.02);
    }
  },
  dresser(G, { w, d }, M) {
    B(G, w, 0.75, d, M.wood, 0, 0.08, 0, 0.015);
    legs(G, w, d, 0.08, M.metal, 0.06, 0.03);
    for (let i = 0; i < 3; i++) B(G, w - 0.06, 0.005, 0.005, M.woodDark, 0, 0.3 + i * 0.2, d / 2);
    const mirror = B(G, w * 0.6, 0.8, 0.02, M.chrome, 0, 1.1, -d / 2 + 0.03, 0.01);
    mirror.castShadow = false;
    plant(G, M, 0.18, w / 2 - 0.15, 0);
  },
  desk(G, { w, d }, M) {
    B(G, w, 0.04, d, M.wood, 0, 0.72, 0, 0.01);
    for (const sx of [-1, 1]) B(G, 0.04, 0.72, d - 0.05, M.metal, sx * (w / 2 - 0.04), 0, 0);
    B(G, 0.5, 0.3, 0.02, M.screen, 0, 0.82, -d / 2 + 0.12).rotation.x = -0.05;
    B(G, 0.12, 0.08, 0.08, M.metal, 0, 0.76, -d / 2 + 0.12);
    lamp(G, M, w / 2 - 0.15, 0.76, -d / 2 + 0.15);
  },
  office_chair(G, _it, M) {
    C(G, 0.28, 0.28, 0.03, M.metal, 0, 0, 0, 5);
    C(G, 0.025, 0.025, 0.42, M.metal, 0, 0.03, 0, 8);
    B(G, 0.48, 0.07, 0.46, M.fabricAlt, 0, 0.45, 0, 0.03);
    B(G, 0.46, 0.5, 0.06, M.fabricAlt, 0, 0.55, -0.22, 0.03);
  },
  dining_set(G, { opts }, M) {
    const tw = Number(opts?.tw ?? 1.2),
      td = Number(opts?.td ?? 0.85),
      seats = Number(opts?.seats ?? 4);
    B(G, tw, 0.04, td, M.wood, 0, 0.73, 0, 0.012);
    for (const sx of [-1, 1]) {
      B(G, 0.06, 0.73, td - 0.25, M.woodDark, sx * (tw / 2 - 0.2), 0, 0);
    }
    const chair = (x: number, z: number, rot: number) => {
      const g = new THREE.Group();
      B(g, 0.44, 0.06, 0.44, M.fabric, 0, 0.44, 0, 0.03);
      B(g, 0.44, 0.45, 0.05, M.fabric, 0, 0.5, -0.2, 0.025);
      legs(g, 0.44, 0.44, 0.44, M.woodDark, 0.04, 0.03);
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      G.add(g);
    };
    const perSide = seats === 6 ? 3 : 2;
    for (let i = 0; i < perSide; i++) {
      const x = (i - (perSide - 1) / 2) * (tw / perSide);
      chair(x, td / 2 + 0.28, Math.PI);
      chair(x, -td / 2 - 0.28, 0);
    }
    // centrepiece
    C(G, 0.08, 0.06, 0.12, M.ceramic, 0, 0.77, 0);
    S(G, 0.07, M.leaf, 0, 0.94, 0, 1.4, 0.8, 1.4);
  },
  sofa(G, { w, d, opts }, M) {
    const style = M.kit.sofa;
    const soft = style === "tufted" || style === "curved" ? M.velvet : M.fabric;
    const seatH = style === "low" ? 0.28 : 0.4;
    const plinth = M.kit.legs === "plinth" || style === "low";
    if (plinth) B(G, w - 0.04, 0.06, d - 0.06, M.woodDark, 0, 0, 0, 0.01);
    else legs(G, w - 0.1, d - 0.1, 0.12, M.legs, 0.04, 0.035);
    const y0 = plinth ? 0.06 : 0.12;
    B(G, w, seatH - y0 - 0.12, d, soft, 0, y0, 0, 0.05); // base
    // back
    if (style === "curved") {
      const back = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.42, 32, 1, false, Math.PI / 2 + 0.5, Math.PI - 1.0), soft);
      back.scale.set(1, 1, (d * 0.55) / (w / 2));
      back.position.set(0, seatH + 0.15, 0.1);
      back.castShadow = true;
      G.add(back);
      B(G, w * 0.82, 0.42, 0.2, soft, 0, seatH - 0.06, -d / 2 + 0.12, 0.09);
    } else {
      const bh = style === "low" ? 0.32 : 0.45;
      B(G, w, bh, 0.22, soft, 0, seatH - 0.02, -d / 2 + 0.11, 0.07);
      if (style === "tufted") for (let i = 0; i < Math.round(w / 0.2); i++) for (let j = 0; j < 2; j++) S(G, 0.012, M.woodDark, -w / 2 + 0.15 + i * 0.2 + (j % 2) * 0.1, seatH + 0.12 + j * 0.15, -d / 2 + 0.225).castShadow = false;
    }
    // arms
    if (style !== "low") {
      for (const sx of [-1, 1]) {
        if (style === "track") B(G, 0.1, 0.24, d, soft, sx * (w / 2 - 0.05), seatH - 0.02, 0, 0.02);
        else if (style === "tufted") {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, d, 20), soft);
          arm.rotation.x = Math.PI / 2;
          arm.position.set(sx * (w / 2 - 0.1), seatH + 0.1, 0);
          arm.castShadow = true;
          G.add(arm);
        } else B(G, 0.18, 0.28, d, soft, sx * (w / 2 - 0.09), seatH - 0.02, 0, style === "curved" ? 0.09 : 0.07);
      }
    }
    const inner = style === "low" ? w - 0.04 : w - 0.36;
    const n = w > 2.2 ? 3 : 2;
    const cw = inner / n;
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + cw * (i + 0.5);
      B(G, cw - 0.02, 0.14, d - 0.3, soft, x, seatH - 0.02, 0.06, 0.06);
      if (style !== "curved") {
        const bc = B(G, cw - 0.06, 0.4, 0.14, soft, x, seatH + 0.08, -d / 2 + 0.28, 0.07);
        bc.rotation.x = -0.12;
      }
    }
    B(G, 0.42, 0.42, 0.12, M.fabricAlt, -w / 2 + 0.45, seatH + 0.12, -d / 2 + 0.38, 0.06).rotation.set(-0.2, 0.25, 0);
    B(G, 0.4, 0.4, 0.12, M.accent, w / 2 - 0.45, seatH + 0.12, -d / 2 + 0.38, 0.06).rotation.set(-0.2, -0.25, 0);
    if (opts?.l) {
      B(G, 0.85, seatH - 0.12, 0.75, soft, w / 2 - 0.6, 0.12, d / 2 + 0.35, 0.05);
      B(G, 0.8, 0.14, 0.72, soft, w / 2 - 0.6, seatH, d / 2 + 0.35, 0.06);
    }
  },
  armchair(G, { w, d }, M) {
    B(G, w, 0.3, d, M.fabricAlt, 0, 0.12, 0, 0.06);
    B(G, w, 0.45, 0.16, M.fabricAlt, 0, 0.4, -d / 2 + 0.08, 0.07);
    for (const sx of [-1, 1]) B(G, 0.14, 0.24, d, M.fabricAlt, sx * (w / 2 - 0.07), 0.4, 0, 0.06);
    B(G, w - 0.3, 0.12, d - 0.2, M.fabricAlt, 0, 0.42, 0.06, 0.05);
    legs(G, w, d, 0.12, M.woodDark, 0.06, 0.035);
  },
  coffee_table(G, { w, d }, M) {
    B(G, w, 0.04, d, M.wood, 0, 0.38, 0, 0.015);
    B(G, w - 0.12, 0.02, d - 0.12, M.woodDark, 0, 0.12, 0, 0.01);
    legs(G, w, d, 0.38, M.legs, 0.05, 0.03);
    B(G, 0.28, 0.04, 0.2, M.accent, -0.2, 0.42, 0.02, 0.01);
    B(G, 0.24, 0.03, 0.18, M.fabricAlt, -0.2, 0.46, 0.02, 0.01);
    C(G, 0.06, 0.05, 0.15, M.ceramic, 0.25, 0.42, -0.05);
  },
  tv_unit(G, { w, d }, M) {
    B(G, w, 0.38, d, M.wood, 0, 0.18, 0, 0.015);
    const n = Math.max(2, Math.round(w / 0.6));
    for (let i = 1; i < n; i++) B(G, 0.005, 0.34, 0.005, M.woodDark, -w / 2 + (w / n) * i, 0.2, d / 2);
    const tvW = Math.min(1.45, w * 0.7);
    const tv = B(G, tvW, tvW * 0.57, 0.04, M.screen, 0, 0.95, -d / 2 + 0.05, 0.01);
    tv.castShadow = false;
    plant(G, M, 0.2, w / 2 - 0.2, 0);
    C(G, 0.05, 0.05, 0.22, M.ceramic, -w / 2 + 0.2, 0.56, 0);
  },
  rug(G, { w, d }, M) {
    const r = B(G, w, 0.012, d, M.rug, 0, 0.004, 0);
    r.castShadow = false;
  },
  plant(G, { w }, M) {
    plant(G, M, w * 0.9);
  },
  planter(G, { w }, M) {
    B(G, w, 0.45, w, M.terracotta, 0, 0, 0, 0.03);
    for (let i = 0; i < 5; i++) S(G, w * 0.28, i % 2 ? M.leaf : M.leafDark, (i - 2) * w * 0.12, 0.6 + (i % 2) * 0.15, (i % 3 - 1) * w * 0.12, 1, 1.2, 1);
  },
  floor_lamp(G, _it, M) {
    C(G, 0.14, 0.15, 0.03, M.metal, 0, 0, 0);
    C(G, 0.015, 0.015, 1.4, M.metal, 0, 0.03, 0, 8);
    const sh = C(G, 0.16, 0.22, 0.28, M.linen, 0, 1.4, 0);
    sh.castShadow = false;
  },
  sideboard(G, { w, d }, M) {
    B(G, w, 0.72, d, M.woodDark, 0, 0.12, 0, 0.015);
    legs(G, w, d, 0.12, M.metal, 0.06, 0.03);
    const n = Math.max(2, Math.round(w / 0.45));
    for (let i = 1; i < n; i++) B(G, 0.005, 0.68, 0.005, M.wood, -w / 2 + (w / n) * i, 0.14, d / 2);
    C(G, 0.09, 0.07, 0.3, M.ceramic, -w / 4, 0.84, 0);
    B(G, 0.6, 0.45, 0.03, M.art[1], w / 6, 0.84, -d / 2 + 0.06).rotation.x = -0.08;
  },
  counter(G, { w, d, opts }, M) {
    B(G, w, 0.1, d - 0.05, M.woodDark, 0, 0, -0.025); // plinth
    B(G, w, 0.76, d - 0.02, M.cabinet, 0, 0.1, 0, 0.005);
    const n = Math.max(1, Math.round(w / 0.6));
    for (let i = 1; i < n; i++) B(G, 0.004, 0.72, 0.004, M.woodDark, -w / 2 + (w / n) * i, 0.12, d / 2);
    B(G, w, 0.04, d + 0.02, M.counter, 0, 0.86, 0.01, 0.005); // top
    const clampX = (x: number, half: number) => Math.min(w / 2 - half, Math.max(-w / 2 + half, x));
    if (opts?.sink || typeof opts?.sinkAt === "number") {
      const sw = Math.min(0.55, w - 0.06);
      const sx = typeof opts?.sinkAt === "number" ? clampX(opts.sinkAt, sw / 2) : -w / 2 + Math.min(0.6, w / 3);
      B(G, sw, 0.012, Math.min(0.42, d - 0.12), M.chrome, sx, 0.9, 0.02);
      C(G, 0.015, 0.015, 0.3, M.chrome, sx, 0.9, -d / 2 + 0.1, 8);
    }
    if (opts?.hob || typeof opts?.hobAt === "number") {
      const hw = Math.min(0.6, w - 0.06);
      const hx = typeof opts?.hobAt === "number" ? clampX(opts.hobAt, hw / 2) : w / 2 - Math.min(0.6, w / 3);
      B(G, hw, 0.01, Math.min(0.5, d - 0.1), M.screen, hx, 0.9, 0.02);
      for (const [a, b] of [
        [-0.15, -0.1],
        [0.15, -0.1],
        [-0.15, 0.12],
        [0.15, 0.12],
      ])
        C(G, 0.07, 0.07, 0.004, M.metal, hx + a, 0.91, b);
      if (opts?.uppers || opts?.hood) {
        B(G, 0.7, 0.35, 0.45, M.metal, hx, 1.62, -d / 2 + 0.25, 0.01).userData.upper = true; // chimney hood
        B(G, 0.25, 0.7, 0.25, M.metal, hx, 1.97, -d / 2 + 0.13).userData.upper = true;
      }
    }
    if (opts?.uppers) {
      const uw = w;
      const u = B(G, uw, 0.72, 0.34, M.cabinet, 0, 1.55, -d / 2 + 0.17, 0.005);
      u.castShadow = true;
      if (opts?.hob) {
        // gap for the hood
        u.visible = false;
        const hx = w / 2 - Math.min(0.6, w / 3);
        const left = hx - 0.4 + w / 2;
        if (left > 0.3) B(G, left, 0.72, 0.34, M.cabinet, -w / 2 + left / 2, 1.55, -d / 2 + 0.17, 0.005);
        const right = w / 2 - (hx + 0.4);
        if (right > 0.3) B(G, right, 0.72, 0.34, M.cabinet, w / 2 - right / 2, 1.55, -d / 2 + 0.17, 0.005);
      }
      // under-cabinet light strip
      const strip = B(G, w * 0.9, 0.01, 0.02, M.light, 0, 1.54, -d / 2 + 0.3);
      strip.castShadow = false;
    }
  },
  bathtub(G, { w, d }, M) {
    B(G, w, 0.55, d, M.ceramic, 0, 0, 0, 0.06);
    const inner = B(G, w - 0.14, 0.02, d - 0.14, M.glass, 0, 0.5, 0, 0.04);
    inner.castShadow = false;
    C(G, 0.015, 0.015, 0.25, M.chrome, -w / 2 + 0.12, 0.55, -d / 2 + 0.08, 8);
  },
  fridge(G, { w, d }, M) {
    B(G, w, 1.85, d, M.chrome, 0, 0, 0, 0.02);
    B(G, 0.02, 0.5, 0.03, M.metal, -w / 2 + 0.07, 1.0, d / 2 + 0.01);
    B(G, w, 0.005, 0.005, M.metal, 0, 1.2, d / 2 + 0.003);
  },
  vanity(G, { w, d }, M) {
    B(G, w, 0.45, d, M.wood, 0, 0.35, 0, 0.01);
    B(G, w, 0.03, d, M.counter, 0, 0.8, 0);
    S(G, 0.18, M.ceramic, 0, 0.86, 0.02, 1.2, 0.35, 0.9);
    C(G, 0.012, 0.012, 0.22, M.chrome, 0, 0.83, -d / 2 + 0.07, 8);
    const mir = B(G, w * 0.85, 0.8, 0.02, M.chrome, 0, 1.15, -d / 2 + 0.02, 0.01);
    mir.castShadow = false;
    const strip = B(G, w * 0.8, 0.02, 0.02, M.light, 0, 1.97, -d / 2 + 0.04);
    strip.castShadow = false;
  },
  wc(G, { d }, M) {
    B(G, 0.36, 0.38, 0.18, M.ceramic, 0, 0.4, -d / 2 + 0.09, 0.03); // concealed cistern box
    S(G, 0.2, M.ceramic, 0, 0.32, 0.08, 0.95, 0.8, 1.25);
    B(G, 0.38, 0.03, 0.46, M.ceramic, 0, 0.42, 0.06, 0.08);
    B(G, 0.24, 0.32, 0.25, M.ceramic, 0, 0, 0.0, 0.05);
  },
  shower(G, { w, d }, M) {
    const g = B(G, 0.01, 2.0, d, M.glass, w / 2 - 0.005, 0.05, 0);
    g.castShadow = false;
    B(G, w - 0.04, 0.03, d - 0.04, M.ceramic, -0.02, 0, 0, 0.01);
    C(G, 0.12, 0.12, 0.015, M.chrome, 0, 2.05, -d / 2 + 0.3);
    B(G, 0.02, 0.02, 0.3, M.chrome, 0, 2.05, -d / 2 + 0.15);
    B(G, 0.15, 0.15, 0.02, M.chrome, 0, 1.0, -d / 2 + 0.01);
  },
  lounge_set(G, { w, d }, M) {
    C(G, 0.25, 0.25, 0.03, M.wood, 0, 0.42, 0);
    C(G, 0.02, 0.02, 0.42, M.metal, 0, 0, 0, 8);
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      B(g, 0.6, 0.12, 0.6, M.fabric, 0, 0.32, 0, 0.04);
      B(g, 0.6, 0.45, 0.08, M.wood, 0, 0.35, -0.27, 0.02);
      legs(g, 0.6, 0.6, 0.32, M.wood, 0.04, 0.035);
      g.position.set(sx * (w / 2 - 0.35), 0, 0);
      g.rotation.y = -sx * 1.1;
      G.add(g);
    }
    C(G, 0.05, 0.04, 0.1, M.ceramic, 0.05, 0.45, 0.04);
    void d;
  },
  console(G, { w, d }, M) {
    B(G, w, 0.04, d, M.wood, 0, 0.8, 0, 0.01);
    B(G, w - 0.1, 0.02, d - 0.06, M.wood, 0, 0.2, 0);
    for (const sx of [-1, 1]) B(G, 0.035, 0.8, d - 0.04, M.metal, sx * (w / 2 - 0.05), 0, 0);
    C(G, 0.08, 0.06, 0.28, M.ceramic, -w / 4, 0.84, 0);
    S(G, 0.08, M.brass, w / 4, 0.92, 0, 1, 1, 1);
  },
  shoe_cabinet(G, { w, d }, M) {
    B(G, w, 1.0, d, M.cabinet, 0, 0.1, 0, 0.01);
    for (let i = 1; i < 3; i++) B(G, w - 0.04, 0.004, 0.004, M.woodDark, 0, 0.1 + i * 0.33, d / 2);
  },
  bookshelf(G, { w, d }, M) {
    const h = 2.0;
    for (const sx of [-1, 1]) B(G, 0.03, h, d, M.wood, sx * (w / 2 - 0.015), 0, 0);
    B(G, w, h, 0.02, M.woodDark, 0, 0, -d / 2 + 0.01);
    const cols = [M.accent, M.fabricAlt, M.art[2], M.linen, M.art[3]];
    for (let i = 0; i < 5; i++) {
      const y = 0.05 + i * 0.4;
      B(G, w - 0.06, 0.025, d - 0.02, M.wood, 0, y, 0.01);
      let x = -w / 2 + 0.06;
      let k = i * 3;
      while (x < w / 2 - 0.25 && i < 4) {
        const bw = 0.03 + ((k * 7) % 5) * 0.008;
        const bh = 0.22 + ((k * 13) % 7) * 0.015;
        B(G, bw, bh, d * 0.7, cols[k % cols.length], x + bw / 2, y + 0.025, 0.02);
        x += bw + 0.004;
        k++;
        if (k % 9 === 0) x += 0.18;
      }
    }
  },
  puja(G, { w, d }, M) {
    B(G, w, 0.75, d, M.wood, 0, 0.1, 0, 0.01);
    B(G, w, 0.04, d + 0.04, M.brass, 0, 0.85, 0);
    B(G, w, 1.0, 0.04, M.wood, 0, 0.89, -d / 2 + 0.02);
    // arch
    const arch = mesh(new THREE.TorusGeometry(w * 0.32, 0.03, 8, 24, Math.PI), M.brass, 0, 1.45, -d / 2 + 0.06);
    G.add(arch);
    B(G, 0.18, 0.3, 0.12, M.brass, 0, 0.89, -d / 2 + 0.15, 0.03);
    const diya = S(G, 0.03, M.light, w * 0.3, 0.92, 0.05, 1, 0.7, 1);
    diya.castShadow = false;
    for (let i = 0; i < 7; i++) S(G, 0.03, i % 2 ? M.accent : M.brass, -w * 0.45 + (i * w * 0.9) / 6, 1.85, -d / 2 + 0.06);
  },
  washer(G, { w, d }, M) {
    B(G, w - 0.02, 0.85, d - 0.02, M.ceramic, 0, 0, 0, 0.02);
    const door = mesh(new THREE.TorusGeometry(0.17, 0.03, 10, 28), M.chrome, 0, 0.45, d / 2 - 0.005);
    G.add(door);
    const glass = mesh(new THREE.CircleGeometry(0.16, 28), M.screen, 0, 0.45, d / 2 - 0.004, false);
    G.add(glass);
  },
  panel(G, { w, opts }, M) {
    // Feature wall behind a bed or TV: the theme's (or room's) treatment, floor to ceiling.
    const h = Number(opts?.h ?? 1.2),
      base = Number(opts?.base ?? 0);
    const full = M.kit.feature.treatment !== "paint" || opts?.fluted;
    const H = full ? Math.max(h, 2.75 - base) : h;
    const p = B(G, w, H, 0.03, M.feature, 0, base, 0);
    p.castShadow = false;
    if (base + H > 1.7) p.userData.upper = true;
    const tex = (M.feature as THREE.MeshStandardMaterial).map;
    if (tex) {
      const m = (tex.userData.metres as number) || 0.72;
      const geo = p.geometry.clone();
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / m), uv.getY(i) * (H / m));
      p.geometry = geo;
    }
  },
  art(G, { w, opts }, M) {
    const h = Number(opts?.h ?? 0.7),
      base = Number(opts?.base ?? 1.4);
    if (opts?.mirror) {
      const f = mesh(new THREE.TorusGeometry(Math.min(w, h) / 2, 0.025, 8, 40), M.brass, 0, base + h / 2, 0.03);
      G.add(f);
      const m = mesh(new THREE.CircleGeometry(Math.min(w, h) / 2, 40), M.chrome, 0, base + h / 2, 0.02, false);
      G.add(m);
      return;
    }
    const n = w > 1.1 ? 2 : 1;
    const pw = (w - (n - 1) * 0.08) / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + pw / 2 + i * (pw + 0.08);
      B(G, pw, h, 0.03, M.frame, x, base, 0.015).castShadow = false;
      B(G, pw - 0.06, h - 0.06, 0.01, M.art[(i + Math.round(w * 10)) % M.art.length], x, base + 0.03, 0.032).castShadow = false;
      B(G, (pw - 0.06) * 0.5, (h - 0.06) * 0.45, 0.012, M.art[(i + 2) % M.art.length], x - pw * 0.08, base + h * 0.3, 0.034).castShadow = false;
    }
  },
  pendant(G, { w, opts }, M) {
    const y = WALL_H;
    if (opts?.linear || M.kit.fixture === "linear") {
      for (const sx of [-1, 1]) C(G, 0.004, 0.004, 0.8, M.metal, sx * w * 0.35, y - 0.8, 0, 4);
      B(G, w * 0.85, 0.05, 0.08, M.metal, 0, y - 0.85, 0, 0.02);
      B(G, w * 0.8, 0.01, 0.05, M.light, 0, y - 0.86, 0).castShadow = false;
      return;
    }
    fixture(G, M, opts?.round ? "pendant" : M.kit.fixture, y, Math.max(1, Math.round(w / 0.6)));
  },
  fixture(G, _it, M) {
    fixture(G, M, M.kit.fixture, WALL_H, 1);
  },
  curtain(G, { w, opts }, M) {
    // A rod at the ceiling with two drapes (open: bunched at the sides; drawn: across) and a sheer layer.
    const top = WALL_H - 0.12;
    const rod = C(G, 0.012, 0.012, w + 0.1, M.metal, 0, top, 0, 8);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, top, 0);
    const drawn = !!opts?.drawn;
    const pleat = (x0: number, x1: number, mat: THREE.Material, z: number) => {
      const n = Math.max(3, Math.round((x1 - x0) / 0.09));
      for (let i = 0; i < n; i++) {
        const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
        const m = mesh(new THREE.CylinderGeometry(0.045, 0.05, top - 0.02, 8), mat, x, (top - 0.02) / 2 + 0.01, z + (i % 2 ? 0.02 : -0.02));
        m.scale.set(((x1 - x0) / n) / 0.09, 1, 0.6);
        m.castShadow = false;
        G.add(m);
      }
    };
    if (drawn) pleat(-w / 2, w / 2, M.curtain, 0.06);
    else {
      pleat(-w / 2, -w / 2 + 0.32, M.curtain, 0.06);
      pleat(w / 2 - 0.32, w / 2, M.curtain, 0.06);
    }
    const sheer = mesh(new THREE.PlaneGeometry(w - (drawn ? 0 : 0.5), top - 0.05), M.sheer, 0, (top - 0.05) / 2 + 0.02, -0.02, false);
    G.add(sheer);
  },
};

function fixture(G: THREE.Group, M: Mats, style: string, y: number, count: number) {
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : (i - (count - 1) / 2) * 0.55;
    if (style === "chandelier") {
      C(G, 0.006, 0.006, 0.6, M.brass, x, y - 0.6, 0, 6);
      const ring = mesh(new THREE.TorusGeometry(0.32, 0.015, 8, 40), M.brass, x, y - 0.75, 0);
      ring.rotation.x = Math.PI / 2;
      G.add(ring);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        C(G, 0.012, 0.012, 0.1, M.ceramic, x + Math.cos(a) * 0.32, y - 0.75, Math.sin(a) * 0.32, 6);
        S(G, 0.025, M.light, x + Math.cos(a) * 0.32, y - 0.62, Math.sin(a) * 0.32).castShadow = false;
      }
      const ring2 = mesh(new THREE.TorusGeometry(0.18, 0.012, 8, 30), M.brass, x, y - 0.95, 0);
      ring2.rotation.x = Math.PI / 2;
      G.add(ring2);
    } else if (style === "globe") {
      for (const [dx, dy, dz] of [
        [0, 0.7, 0],
        [0.18, 0.55, 0.1],
        [-0.16, 0.85, -0.08],
      ]) {
        C(G, 0.003, 0.003, dy, M.brass, x + dx, y - dy, dz, 4);
        const g = S(G, 0.1, M.light, x + dx, y - dy - 0.1, dz);
        g.castShadow = false;
      }
    } else if (style === "rattan") {
      C(G, 0.004, 0.004, 0.55, M.metal, x, y - 0.55, 0, 4);
      const shade = mesh(new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), M.rattan, x, y - 0.6, 0);
      shade.scale.y = 0.9;
      shade.material = M.rattan;
      G.add(shade);
      S(G, 0.05, M.light, x, y - 0.72, 0).castShadow = false;
    } else {
      C(G, 0.004, 0.004, 0.75, M.metal, x, y - 0.75, 0, 4);
      G.add(mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.metal, x, y - 0.95, 0));
      S(G, 0.06, M.light, x, y - 0.95, 0).castShadow = false;
    }
  }
}

/** Builds one placed item as a three.js group in plan space (x = plan x, z = plan y). */
export function buildItem(it: Item, M: Mats) {
  const G = new THREE.Group();
  builders[it.kind]?.(G, it, M);
  G.position.set(it.x, 0, it.y);
  G.rotation.y = it.rot;
  G.userData.kind = it.kind;
  return G;
}

/** Things you can't walk through in walk-through mode. */
export const SOLID_KINDS = new Set<Item["kind"]>(["bathtub", "bed", "wardrobe", "dining_set", "sofa", "armchair", "coffee_table", "tv_unit", "sideboard", "counter", "fridge", "vanity", "shower", "lounge_set", "console", "shoe_cabinet", "bookshelf", "puja", "washer", "desk", "dresser", "side_table", "wc"]);
