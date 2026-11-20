import * as THREE from "three";
import { DOOR_H, HEAD_H, SILL_H, WALL_H, type HomeScene, type Opening, wallPieces } from "@/lib/home-scene";
import { isWet, worldUV, type Mats } from "./materials";
import { furnish, type Item } from "./furnish";
import { buildItem, SOLID_KINDS } from "./models";

export type Blocker = { x1: number; y1: number; x2: number; y2: number };

export type Built = {
  root: THREE.Group;
  fullWalls: THREE.Group;
  lowWalls: THREE.Group;
  ceilings: THREE.Group;
  blockers: Blocker[];
  items: Item[];
};

const INNER_T = 0.12;
const OUTER_T = 0.2;
const LOW_H = 1.15;

/** Builds the whole home in plan space (x = plan x, z = plan y, y = up). */
export function buildHouse(scene: HomeScene, M: Mats): Built {
  const root = new THREE.Group();
  const fullWalls = new THREE.Group();
  const lowWalls = new THREE.Group();
  const ceilings = new THREE.Group();
  const blockers: Blocker[] = [];

  // Ground slab under the house.
  const pad = 1.2;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(scene.width + pad * 2, 0.2, scene.depth + pad * 2), M.ground);
  ground.position.set(scene.width / 2, -0.11, scene.depth / 2);
  ground.receiveShadow = true;
  root.add(ground);

  // Floors.
  for (const r of scene.rooms) {
    const mat = r.type === "balcony" ? M.deck : isWet(r.type) || r.type === "kitchen" ? (r.type === "kitchen" ? M.floor : M.wetFloor) : M.floor;
    const g = new THREE.PlaneGeometry(r.w, r.d);
    g.rotateX(-Math.PI / 2);
    g.translate(r.x + r.w / 2, 0, r.y + r.d / 2);
    const metres = ((mat as THREE.MeshStandardMaterial).map?.userData.metres as number) ?? 1;
    worldUV(g, metres, "xz");
    const f = new THREE.Mesh(g, mat);
    f.receiveShadow = true;
    f.userData.room = r.name;
    root.add(f);

    // Ceiling with downlights (walk-through only).
    if (r.type !== "balcony") {
      const cg = new THREE.PlaneGeometry(r.w, r.d);
      cg.rotateX(Math.PI / 2);
      const c = new THREE.Mesh(cg, M.ceiling);
      c.position.set(r.x + r.w / 2, WALL_H, r.y + r.d / 2);
      ceilings.add(c);
      const nx = Math.max(1, Math.round(r.w / 1.6)),
        ny = Math.max(1, Math.round(r.d / 1.6));
      const disc = new THREE.CircleGeometry(0.06, 16);
      disc.rotateX(Math.PI / 2);
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          const d = new THREE.Mesh(disc, M.light);
          d.position.set(r.x + (r.w / nx) * (i + 0.5), WALL_H - 0.005, r.y + (r.d / ny) * (j + 0.5));
          ceilings.add(d);
        }
      // Cove strip around big rooms
      if (r.w * r.d > 9 && !isWet(r.type)) {
        const cove = new THREE.Mesh(new THREE.BoxGeometry(r.w - 0.5, 0.02, r.d - 0.5), M.ceiling);
        cove.position.set(r.x + r.w / 2, WALL_H - 0.2, r.y + r.d / 2);
        ceilings.add(cove);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(r.w - 0.56, 0.005, r.d - 0.56), M.light);
        glow.position.set(r.x + r.w / 2, WALL_H - 0.185, r.y + r.d / 2);
        ceilings.add(glow);
      }
    }
  }

  // Walls with openings.
  const pieces = wallPieces(scene.rooms);
  const onLine = (o: Opening, dir: "h" | "v", at: number) => o.dir === dir && Math.abs((dir === "h" ? o.y : o.x) - at) < 0.03;
  const segBox = (dir: "h" | "v", at: number, a: number, b: number, t: number, y0: number, y1: number, mats: THREE.Material | THREE.Material[], group: THREE.Group, block: boolean) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return;
    const len = b - a + (dir === "h" ? t : t) * 0; // keep exact; corners overlap via thickness below
    const g = dir === "h" ? new THREE.BoxGeometry(len + 0.001, y1 - y0, t) : new THREE.BoxGeometry(t, y1 - y0, len + 0.001);
    const m = new THREE.Mesh(g, mats);
    m.position.set(dir === "h" ? (a + b) / 2 : at, (y0 + y1) / 2, dir === "h" ? at : (a + b) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (block && y0 < 1.5) {
      const h = t / 2 + 0.02;
      blockers.push(dir === "h" ? { x1: a, y1: at - h, x2: b, y2: at + h } : { x1: at - h, y1: a, x2: at + h, y2: b });
    }
  };
  const capMats = [M.wall, M.wall, M.wallCap, M.wall, M.wall, M.wall];

  // Corner posts so wall ends meet cleanly.
  const posts = new Map<string, number>();
  for (const p of pieces) {
    const t = p.outer ? OUTER_T : INNER_T;
    for (const e of [p.from, p.to]) {
      const k = p.dir === "h" ? `${e.toFixed(2)},${p.at.toFixed(2)}` : `${p.at.toFixed(2)},${e.toFixed(2)}`;
      if (!p.balcony) posts.set(k, Math.max(posts.get(k) ?? 0, t));
    }
  }
  for (const [k, t] of posts) {
    const [x, z] = k.split(",").map(Number);
    for (const [grp, h, mats] of [
      [fullWalls, WALL_H, M.wall],
      [lowWalls, LOW_H, capMats],
    ] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), mats);
      m.position.set(x, h / 2, z);
      m.castShadow = m.receiveShadow = true;
      grp.add(m);
    }
  }

  for (const p of pieces) {
    const t = p.outer ? OUTER_T : INNER_T;
    const doors = scene.doors.filter((o) => onLine(o, p.dir, p.at)).map((o) => ({ c: p.dir === "h" ? o.x : o.y, w: o.width, kind: "door" as const, main: !!o.main }));
    const wins = scene.windows.filter((o) => onLine(o, p.dir, p.at)).map((o) => ({ c: p.dir === "h" ? o.x : o.y, w: o.width, kind: "window" as const, main: false }));
    const ops = [...doors, ...wins]
      .map((o) => ({ ...o, a: Math.max(p.from, o.c - o.w / 2), b: Math.min(p.to, o.c + o.w / 2) }))
      .filter((o) => o.b - o.a > 0.2)
      .sort((x, y) => x.a - y.a);

    if (p.balcony) {
      // Glass railing.
      let cur = p.from;
      const rail = (a: number, b: number) => {
        segBox(p.dir, p.at, a, b, 0.08, 0, 0.12, M.wall, root, true);
        segBox(p.dir, p.at, a, b, 0.02, 0.12, 1.0, M.glass, root, false);
        segBox(p.dir, p.at, a, b, 0.06, 1.0, 1.05, M.rail, root, false);
      };
      for (const o of ops) {
        if (o.kind === "door") {
          rail(cur, o.a);
          cur = o.b;
        }
      }
      rail(cur, p.to);
      continue;
    }

    let cur = p.from;
    for (const o of ops) {
      if (o.a < cur) continue;
      segBox(p.dir, p.at, cur, o.a, t, 0, WALL_H, M.wall, fullWalls, true);
      segBox(p.dir, p.at, cur, o.a, t, 0, LOW_H, capMats, lowWalls, false);
      if (o.kind === "door") {
        segBox(p.dir, p.at, o.a, o.b, t, DOOR_H, WALL_H, M.wall, fullWalls, false);
        addDoorFrame(fullWalls, p.dir, p.at, o.a, o.b, t, M, o.main);
        addDoorFrame(lowWalls, p.dir, p.at, o.a, o.b, t, M, o.main, LOW_H);
      } else {
        segBox(p.dir, p.at, o.a, o.b, t, 0, SILL_H, M.wall, fullWalls, true);
        segBox(p.dir, p.at, o.a, o.b, t, HEAD_H, WALL_H, M.wall, fullWalls, false);
        segBox(p.dir, p.at, o.a, o.b, t, 0, SILL_H, capMats, lowWalls, true);
        for (const [grp, top] of [
          [fullWalls, HEAD_H],
          [lowWalls, LOW_H],
        ] as const) {
          segBox(p.dir, p.at, o.a, o.b, 0.02, SILL_H, top, M.glass, grp, false);
          segBox(p.dir, p.at, o.a, o.b, t + 0.02, SILL_H - 0.03, SILL_H, M.frameLight, grp, false);
          const mid = (o.a + o.b) / 2;
          segBox(p.dir, p.at, mid - 0.02, mid + 0.02, 0.05, SILL_H, top, M.rail, grp, false);
          if (top === HEAD_H) segBox(p.dir, p.at, o.a, o.b, 0.05, HEAD_H - 0.03, HEAD_H, M.rail, grp, false);
        }
      }
      cur = o.b;
    }
    segBox(p.dir, p.at, cur, p.to, t, 0, WALL_H, M.wall, fullWalls, true);
    segBox(p.dir, p.at, cur, p.to, t, 0, LOW_H, capMats, lowWalls, false);
  }

  // Skirting along floors is skipped for performance; furniture next.
  const items = furnish(scene);
  for (const it of items) {
    const g = buildItem(it, M);
    if (it.kind === "pendant") ceilings.add(g);
    else root.add(g);
    if (SOLID_KINDS.has(it.kind)) {
      const turned = Math.abs(Math.sin(it.rot)) > 0.5;
      const hw = (turned ? it.d : it.w) / 2,
        hd = (turned ? it.w : it.d) / 2;
      blockers.push({ x1: it.x - hw, y1: it.y - hd, x2: it.x + hw, y2: it.y + hd });
    }
  }

  root.add(fullWalls, lowWalls, ceilings);
  return { root, fullWalls, lowWalls, ceilings, blockers, items };
}

function addDoorFrame(G: THREE.Group, dir: "h" | "v", at: number, a: number, b: number, t: number, M: Mats, main: boolean, maxH = DOOR_H) {
  const h = Math.min(DOOR_H, maxH);
  const add = (w: number, hh: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const g = dir === "h" ? new THREE.BoxGeometry(w, hh, d) : new THREE.BoxGeometry(d, hh, w);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(dir === "h" ? x : at, y, dir === "h" ? at : x);
    if (dir === "v") mesh.position.z = x;
    mesh.castShadow = true;
    G.add(mesh);
    return mesh;
  };
  // jambs
  add(0.05, h, t + 0.04, a + 0.025, h / 2, at, M.frame);
  add(0.05, h, t + 0.04, b - 0.025, h / 2, at, M.frame);
  if (maxH >= DOOR_H) add(b - a, 0.05, t + 0.04, (a + b) / 2, DOOR_H - 0.025, at, M.frame);
  if (maxH < DOOR_H) return; // cut-away view: frames only
  // Door leaf, swung open ~80°, hinged at a.
  const leafW = b - a - 0.1;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, h - 0.03, 0.04), main ? M.woodDark : M.door);
  leaf.castShadow = true;
  const pivot = new THREE.Group();
  leaf.position.set(leafW / 2, (h - 0.03) / 2, 0);
  pivot.add(leaf);
  if (main) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.03), M.brass);
    handle.position.set(leafW - 0.08, 1.0, 0.04);
    pivot.add(handle);
  }
  if (dir === "h") {
    pivot.position.set(a + 0.05, 0, at);
    pivot.rotation.y = -1.4;
  } else {
    pivot.position.set(at, 0, a + 0.05);
    pivot.rotation.y = -Math.PI / 2 + 1.4;
  }
  G.add(pivot);
}
