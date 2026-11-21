import * as THREE from "three";
import { DOOR_H, HALF_H, HEAD_H, SILL_H, WALL_H, wallLen, type HomeScene, type Wall, type WallOpening } from "@/lib/home-scene";
import { isWet, worldUV, type Mats } from "./materials";
import { furnish, type Item } from "./furnish";
import { buildItem, SOLID_KINDS } from "./models";

/** Things you can't walk through: furniture boxes and wall segments (plan metres). */
export type Blocker = { kind: "box"; x1: number; y1: number; x2: number; y2: number } | { kind: "seg"; ax: number; ay: number; bx: number; by: number; r: number };

export type Built = {
  root: THREE.Group;
  fullWalls: THREE.Group;
  lowWalls: THREE.Group;
  ceilings: THREE.Group;
  blockers: Blocker[];
  items: Item[];
};

export const LOW_H = 1.15;

/** Builds the whole home in plan space (x = plan x, z = plan y, y = up). */
export function buildHouse(scene: HomeScene, M: Mats): Built {
  const root = new THREE.Group();
  const fullWalls = new THREE.Group();
  const lowWalls = new THREE.Group();
  const ceilings = new THREE.Group();
  const blockers: Blocker[] = [];
  const { x0, y0, x1, y1 } = scene.box;

  // Ground slab under the house.
  const pad = 1.2;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + pad * 2, 0.2, y1 - y0 + pad * 2), M.ground);
  ground.position.set((x0 + x1) / 2, -0.11, (y0 + y1) / 2);
  ground.receiveShadow = true;
  root.add(ground);

  // Floors and ceilings per room.
  for (const r of scene.rooms) {
    const mat = r.type === "balcony" ? M.deck : r.type === "kitchen" ? M.floor : isWet(r.type) ? M.wetFloor : M.floor;
    const g = new THREE.PlaneGeometry(r.w, r.d);
    g.rotateX(-Math.PI / 2);
    g.translate(r.x + r.w / 2, isWet(r.type) ? 0.002 : 0, r.y + r.d / 2);
    const metres = ((mat as THREE.MeshStandardMaterial).map?.userData.metres as number) ?? 1;
    worldUV(g, metres, "xz");
    const f = new THREE.Mesh(g, mat);
    f.receiveShadow = true;
    root.add(f);

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
      if (r.w * r.d > 9 && !isWet(r.type) && r.w > 1.2 && r.d > 1.2) {
        const cove = new THREE.Mesh(new THREE.BoxGeometry(r.w - 0.5, 0.02, r.d - 0.5), M.ceiling);
        cove.position.set(r.x + r.w / 2, WALL_H - 0.2, r.y + r.d / 2);
        ceilings.add(cove);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(r.w - 0.56, 0.005, r.d - 0.56), M.light);
        glow.position.set(r.x + r.w / 2, WALL_H - 0.185, r.y + r.d / 2);
        ceilings.add(glow);
      }
    }
  }

  // Walls.
  const byWall = new Map<string, WallOpening[]>();
  for (const o of scene.openings) byWall.set(o.wall, [...(byWall.get(o.wall) ?? []), o]);
  for (const w of scene.walls) buildWall(w, byWall.get(w.id) ?? [], M, { fullWalls, lowWalls, root }, blockers);

  // Furniture.
  const items = furnish(scene);
  for (const it of items) {
    const g = buildItem(it, M);
    if (it.kind === "pendant") ceilings.add(g);
    else root.add(g);
    if (SOLID_KINDS.has(it.kind)) {
      const turned = Math.abs(Math.sin(it.rot)) > 0.5;
      const hw = (turned ? it.d : it.w) / 2,
        hd = (turned ? it.w : it.d) / 2;
      blockers.push({ kind: "box", x1: it.x - hw, y1: it.y - hd, x2: it.x + hw, y2: it.y + hd });
    }
  }

  root.add(fullWalls, lowWalls, ceilings);
  return { root, fullWalls, lowWalls, ceilings, blockers, items };
}

type Groups = { fullWalls: THREE.Group; lowWalls: THREE.Group; root: THREE.Group };

/** One wall, built in its own frame: x along the wall from its start, z across it, y up. */
function buildWall(w: Wall, ops: WallOpening[], M: Mats, G: Groups, blockers: Blocker[]) {
  const L = wallLen(w);
  if (L < 0.05) return;
  const ux = (w.b[0] - w.a[0]) / L,
    uy = (w.b[1] - w.a[1]) / L;
  const frame = () => {
    const g = new THREE.Group();
    g.position.set(w.a[0], 0, w.a[1]);
    g.rotation.y = Math.atan2(-uy, ux);
    return g;
  };
  const full = frame(),
    low = frame(),
    always = frame();
  const t = w.t;
  const capMats = [M.wall, M.wall, M.wallCap, M.wall, M.wall, M.wall];
  const box = (g: THREE.Group, a: number, b: number, y0: number, y1: number, th: number, mat: THREE.Material | THREE.Material[], z = 0, shadow = true) => {
    if (b - a < 0.005 || y1 - y0 < 0.005) return null;
    const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, y1 - y0, th), mat);
    m.position.set((a + b) / 2, (y0 + y1) / 2, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const block = (a: number, b: number, r = t / 2) => {
    if (b - a < 0.02) return;
    blockers.push({ kind: "seg", ax: w.a[0] + ux * a, ay: w.a[1] + uy * a, bx: w.a[0] + ux * b, by: w.a[1] + uy * b, r });
  };

  // Gaps for openings, in order along the wall.
  const gaps = ops
    .map((o) => ({ o, a: Math.max(0, o.at - o.width / 2), b: Math.min(L, o.at + o.width / 2) }))
    .filter((g) => g.b - g.a > 0.2)
    .sort((p, q) => p.a - q.a);
  const ext = w.kind === "full" || w.kind === "half" ? t / 2 : 0; // close the corners
  const solids: [number, number][] = [];
  let cur = -ext;
  for (const g of gaps) {
    if (g.a > cur) solids.push([cur, g.a]);
    cur = Math.max(cur, g.b);
  }
  if (cur < L + ext) solids.push([cur, L + ext]);

  if (w.kind === "full") {
    for (const [a, b] of solids) {
      box(full, a, b, 0, WALL_H, t, M.wall);
      box(low, a, b, 0, LOW_H, t, capMats);
      block(a, b);
    }
    for (const { o, a, b } of gaps) {
      if (o.type === "window") {
        box(full, a, b, 0, SILL_H, t, M.wall);
        box(full, a, b, HEAD_H, WALL_H, t, M.wall);
        box(low, a, b, 0, SILL_H, t, capMats);
        windowFill(full, a, b, HEAD_H, t, M, box);
        windowFill(low, a, b, LOW_H, t, M, box);
        block(a, b);
      } else {
        const top = o.type === "opening" ? DOOR_H + 0.15 : DOOR_H;
        box(full, a, b, top, WALL_H, t, M.wall);
        doorway(full, a, b, t, top, M, o, box, true);
        doorway(low, a, b, t, LOW_H, M, o, box, false);
      }
    }
  } else if (w.kind === "half") {
    for (const [a, b] of solids) {
      box(always, a, b, 0, HALF_H - 0.04, t, M.wall);
      box(always, a - 0.01, b + 0.01, HALF_H - 0.04, HALF_H, t + 0.04, M.woodDark);
      block(a, b);
    }
  } else if (w.kind === "glass") {
    for (const [a, b] of solids) {
      for (const [g, h] of [
        [full, WALL_H],
        [low, LOW_H],
      ] as const) {
        box(g, a, b, 0.02, h - 0.03, 0.012, M.glass, 0, false);
        box(g, a, b, 0, 0.04, 0.05, M.rail);
        if (h === WALL_H) box(g, a, b, h - 0.04, h, 0.05, M.rail);
        const n = Math.max(1, Math.round((b - a) / 1.2));
        for (let i = 0; i <= n; i++) {
          const x = a + ((b - a) * i) / n;
          box(g, x - 0.02, x + 0.02, 0, h, 0.05, M.rail);
        }
      }
      block(a, b, 0.05);
    }
  } else {
    // railing
    for (const [a, b] of solids) {
      box(always, a, b, 0, 0.12, 0.1, M.wall);
      box(always, a, b, 0.12, 1.0, 0.02, M.glass, 0, false);
      box(always, a, b, 1.0, 1.05, 0.06, M.rail);
      block(a, b, 0.06);
    }
  }
  G.fullWalls.add(full);
  G.lowWalls.add(low);
  G.root.add(always);
}

type BoxFn = (g: THREE.Group, a: number, b: number, y0: number, y1: number, th: number, mat: THREE.Material | THREE.Material[], z?: number, shadow?: boolean) => THREE.Mesh | null;

function windowFill(g: THREE.Group, a: number, b: number, top: number, t: number, M: Mats, box: BoxFn) {
  box(g, a, b, SILL_H, top, 0.02, M.glass, 0, false);
  box(g, a - 0.01, b + 0.01, SILL_H - 0.03, SILL_H, t + 0.04, M.frameLight);
  const mid = (a + b) / 2;
  box(g, mid - 0.02, mid + 0.02, SILL_H, top, 0.05, M.rail);
  box(g, a, a + 0.04, SILL_H, top, 0.05, M.rail);
  box(g, b - 0.04, b, SILL_H, top, 0.05, M.rail);
  if (top === HEAD_H) box(g, a, b, HEAD_H - 0.04, HEAD_H, 0.05, M.rail);
}

function doorway(g: THREE.Group, a: number, b: number, t: number, maxH: number, M: Mats, o: WallOpening, box: BoxFn, full: boolean) {
  const h = Math.min(DOOR_H, maxH);
  if (o.type === "opening") {
    // A plain archway: just a slim lining.
    box(g, a, a + 0.03, 0, Math.min(DOOR_H + 0.15, maxH), t + 0.02, M.frameLight);
    box(g, b - 0.03, b, 0, Math.min(DOOR_H + 0.15, maxH), t + 0.02, M.frameLight);
    if (full) box(g, a, b, DOOR_H + 0.12, DOOR_H + 0.15, t + 0.02, M.frameLight);
    return;
  }
  // jambs and head
  box(g, a, a + 0.05, 0, h, t + 0.04, M.frame);
  box(g, b - 0.05, b, 0, h, t + 0.04, M.frame);
  if (full) box(g, a, b, DOOR_H - 0.05, DOOR_H, t + 0.04, M.frame);
  if (o.type === "sliding") {
    // Two glass panels, one slid half open.
    const w = (b - a - 0.1) / 2 + 0.03;
    for (const [x, z] of [
      [a + 0.05, -0.025],
      [a + 0.05 + w * 0.55, 0.025],
    ]) {
      box(g, x, x + w, 0.02, h - 0.03, 0.012, M.glass, z, false);
      box(g, x, x + 0.04, 0, h, 0.04, M.rail, z);
      box(g, x + w - 0.04, x + w, 0, h, 0.04, M.rail, z);
      box(g, x, x + w, 0, 0.05, 0.04, M.rail, z);
      if (full) box(g, x, x + w, h - 0.05, h, 0.04, M.rail, z);
    }
    return;
  }
  if (!full) return; // cut-away view: frames only
  // Hinged leaf, swung open ~80°.
  const leafW = b - a - 0.1;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, h - 0.03, 0.04), o.main ? M.woodDark : M.door);
  leaf.castShadow = true;
  leaf.position.set(leafW / 2, (h - 0.03) / 2, 0);
  const pivot = new THREE.Group();
  pivot.add(leaf);
  if (o.main) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.03), M.brass);
    handle.position.set(leafW - 0.08, 1.0, 0.04);
    pivot.add(handle);
  }
  pivot.position.set(a + 0.05, 0, 0);
  pivot.rotation.y = o.flip ? 1.4 : -1.4;
  g.add(pivot);
}
