import { alignRooms, along, axisOf, project, snapFurniture, type HomeScene, type Pt, type Wall } from "@/lib/home-scene";

/**
 * Lines walls up with the plan picture: each straight wall slides (a little) onto the band of dark pixels
 * nearest to it, takes that band's thickness, and wall ends are joined to the walls they meet.
 * Runs in the browser on the plan image.
 */
export function snapToPlan(scene: HomeScene, img: HTMLImageElement): { scene: HomeScene; moved: number } {
  if (!scene.underlay) return { scene, moved: 0 };
  const maxSide = 2400;
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * k),
    H = Math.round(img.naturalHeight * k);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.drawImage(img, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const dark = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    // Walls are drawn black or grey-filled; coloured marks (red dimensions, blue windows) are ignored.
    const r = px[i],
      gg = px[i + 1],
      b = px[i + 2];
    const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
    const chroma = Math.max(r, gg, b) - Math.min(r, gg, b);
    dark[j] = lum < 200 && chroma < 45 ? 1 : 0;
  }
  const mpp = scene.underlay.w / W; // metres per pixel
  const isDark = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && dark[y * W + x] === 1;

  const opsBy = new Map<string, { at: number; width: number }[]>();
  for (const o of scene.openings) opsBy.set(o.wall, [...(opsBy.get(o.wall) ?? []), o]);
  // Remember where every opening is, so moving wall ends doesn't shift them.
  const opAbs = new Map(scene.openings.map((o) => [o.id, along(scene.walls.find((w) => w.id === o.wall)!, o.at)]));

  let moved = 0;
  const walls: Wall[] = scene.walls.map((w) => ({ ...w, a: [...w.a] as Pt, b: [...w.b] as Pt }));
  for (const w of walls) {
    const ax = axisOf(w);
    if (!ax || w.kind === "railing") continue;
    const horiz = ax === "h";
    const lo = horiz ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
    const hi = horiz ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
    const at = horiz ? w.a[1] : w.a[0];
    const L = hi - lo;
    if (L < 0.4) continue;
    // Sample points along the middle of the wall, skipping its doors and windows.
    const gaps = (opsBy.get(w.id) ?? []).map((o) => {
      const start = horiz ? (w.a[0] <= w.b[0] ? w.a[0] + o.at : w.a[0] - o.at) : w.a[1] <= w.b[1] ? w.a[1] + o.at : w.a[1] - o.at;
      return [start - o.width / 2 - 0.1, start + o.width / 2 + 0.1];
    });
    const samples: number[] = [];
    const n = Math.min(120, Math.max(12, Math.round(L / mpp / 4)));
    for (let i = 0; i < n; i++) {
      const s = lo + L * (0.12 + (0.76 * i) / (n - 1));
      if (!gaps.some(([p, q]) => s > p && s < q)) samples.push(Math.round(s / mpp));
    }
    if (samples.length < 6) continue;
    const R = Math.max(6, Math.round(0.4 / mpp));
    const c0 = Math.round(at / mpp);
    const score: number[] = [];
    for (let d = -R; d <= R; d++) {
      let hit = 0;
      for (const s of samples) if (horiz ? isDark(s, c0 + d) : isDark(c0 + d, s)) hit++;
      score.push(hit / samples.length);
    }
    // Bands of rows that are mostly dark along the wall. A real wall is a solid band (thick);
    // thin lines are furniture, hatching or dimension lines, so they're skipped.
    const minPx = Math.max(3, Math.round(0.06 / mpp));
    const bands: [number, number][] = [];
    for (let i = 0; i < score.length; i++) {
      if (score[i] < 0.5) continue;
      let j = i;
      while (j + 1 < score.length && score[j + 1] >= 0.5) j++;
      if (j - i + 1 >= minPx) bands.push([i, j]);
      i = j;
    }
    if (!bands.length) continue; // no clear wall band near — leave it
    const [s0, s1] = bands.reduce((p, q) => (Math.abs((q[0] + q[1]) / 2 - R) < Math.abs((p[0] + p[1]) / 2 - R) ? q : p));
    const centre = ((c0 - R + (s0 + s1) / 2) + 0.5) * mpp;
    const thick = (s1 - s0 + 1) * mpp;
    if (Math.abs(centre - at) > 0.01) moved++;
    if (horiz) w.a[1] = w.b[1] = +centre.toFixed(3);
    else w.a[0] = w.b[0] = +centre.toFixed(3);
    if (w.kind === "full" && thick >= 0.07 && thick <= 0.45) w.t = +thick.toFixed(3);
  }

  // Join wall ends to the walls they run into, and merge ends that nearly meet.
  const JOIN = 0.35;
  for (const w of walls) {
    for (const end of ["a", "b"] as const) {
      const p = w[end];
      let best: Pt | null = null,
        bd = JOIN;
      for (const o of walls) {
        if (o === w) continue;
        for (const q of [o.a, o.b]) {
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < Math.min(bd, 0.2)) (bd = d), (best = [q[0], q[1]]);
        }
      }
      if (!best) {
        for (const o of walls) {
          if (o === w) continue;
          const oa = axisOf(o),
            wa = axisOf(w);
          if (!oa || !wa || oa === wa) continue;
          const pr = project(o, p);
          if (pr.dist < bd && pr.inside) {
            bd = pr.dist;
            best = oa === "h" ? [p[0], o.a[1]] : [o.a[0], p[1]];
          }
        }
      }
      if (best) {
        const ax = axisOf(w);
        // keep the wall straight
        if (ax === "h") w[end] = [best[0], w[end][1]];
        else if (ax === "v") w[end] = [w[end][0], best[1]];
        else w[end] = best;
      }
    }
  }
  const openings = scene.openings.map((o) => {
    const w = walls.find((x) => x.id === o.wall)!;
    const p = opAbs.get(o.id);
    return p ? { ...o, at: +project(w, p).at.toFixed(3) } : o;
  });
  return { scene: snapFurniture(alignRooms({ ...scene, walls, openings, snapped: true })), moved };
}
