"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { axisOpenings, type HomeScene } from "@/lib/home-scene";
import { MOODS, MOOD_IDS, THEMES, type Look, type MoodId, type Shot } from "@/lib/themes";
import { buildHouse, type Blocker, type Built } from "./build";
import { clearGeoCache } from "./models";

type Mode = "overview" | "walk";
export type ViewerApi = {
  /** A picture from the standard dollhouse angle. */
  snapshot: () => Promise<Blob | null>;
  /** A picture of exactly what the camera sees now. */
  shot: () => Promise<Blob | null>;
  getCamera: () => Shot["cam"];
  setCamera: (cam: Shot["cam"]) => void;
};
const lookKey = (l: Look, curtains: string) => JSON.stringify({ t: l.theme, c: l.custom, r: l.rooms, curtains });

const EYE = 1.6;
const RADIUS = 0.22;

export default function HomeViewer({
  scene,
  look: lookProp,
  explore,
  onReady,
  onRoomChange,
  onFirstFrame,
  height = "min(78vh, 760px)",
}: {
  scene: HomeScene;
  /** Theme, mood and room overrides. Changing it updates the 3D. */
  look: Look;
  /** Lets the viewer (e.g. a client in the portal) try other themes and moods without saving. */
  explore?: boolean;
  onReady?: (api: ViewerApi) => void;
  /** The room the walker is standing in. */
  onRoomChange?: (room: string) => void;
  /** Called once with a picture after the first render (used to save the design thumbnail). */
  onFirstFrame?: (snapshot: Blob | null) => void;
  height?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("overview");
  const skipMode = useRef(false);
  const [lowWalls, setLowWalls] = useState(true);
  const [tryTheme, setTryTheme] = useState<string | null>(null);
  const [tryMood, setTryMood] = useState<MoodId | null>(null);
  const look: Look = explore ? { ...lookProp, ...(tryTheme ? { theme: tryTheme, custom: undefined, rooms: {} } : {}), mood: tryMood ?? lookProp.mood } : lookProp;
  const [here, setHere] = useState<string>("");
  const [failed, setFailed] = useState(false);
  const [touch, setTouch] = useState(false);
  const api = useRef<{
    setMode: (m: Mode) => void;
    setLow: (b: boolean) => void;
    setLook: (l: Look) => void;
    goTo: (room: string) => void;
    snapshot: () => Promise<Blob | null>;
    stick: { x: number; y: number };
  } | null>(null);
  const firstFrameRef = useRef(onFirstFrame);
  firstFrameRef.current = onFirstFrame;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const roomRef = useRef(onRoomChange);
  roomRef.current = onRoomChange;
  const lookRef = useRef(look);
  lookRef.current = look;

  const roomNames = [...new Set(scene.rooms.map((r) => r.name))];

  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }
    const small = Math.min(el.clientWidth, el.clientHeight) < 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.display = "block";

    const three = new THREE.Scene();
    three.background = new THREE.Color("#f3eee6");
    const pmrem = new THREE.PMREMGenerator(renderer);
    three.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    three.environmentIntensity = 0.55;

    const { x0: BX0, y0: BY0, x1: BX1, y1: BY1 } = scene.box;
    const W = BX1 - BX0,
      D = BY1 - BY0,
      S = Math.max(W, D);
    const centre = new THREE.Vector3((BX0 + BX1) / 2, 0, (BY0 + BY1) / 2);
    const sceneDoors = axisOpenings(scene).doors;

    const hemi = new THREE.HemisphereLight("#fffaf2", "#b9a88f", 0.9);
    three.add(hemi);
    const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
    sun.position.set(centre.x - S * 0.6, S * 1.2, centre.z - S * 0.35);
    sun.target.position.copy(centre);
    sun.castShadow = true;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -S * 0.8;
    sc.right = sc.top = S * 0.8;
    sc.near = 0.5;
    sc.far = S * 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    three.add(sun, sun.target);
    const fill = new THREE.DirectionalLight("#dfe8ff", 0.5);
    fill.position.set(centre.x + S, S * 0.6, centre.z + S);
    three.add(fill);

    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.05, 400);
    // Frame the whole home from a 3/4 angle, far enough back to fit it on screen.
    const overviewPos = () => {
      const aspect = Math.max(0.6, el.clientWidth / Math.max(1, el.clientHeight));
      const fit = (S * 0.62) / Math.tan(THREE.MathUtils.degToRad(22.5)) / Math.min(1, aspect);
      return new THREE.Vector3(centre.x + fit * 0.38, fit * 0.78, centre.z + fit * 0.62);
    };
    camera.position.copy(overviewPos());
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.copy(centre);
    orbit.enableDamping = true;
    orbit.maxPolarAngle = 1.32;
    orbit.minDistance = 2;
    orbit.maxDistance = S * 3;
    orbit.update();

    // ---------- the house ----------
    let built: Built | null = null;
    let blockers: Blocker[] = [];
    let currentKey = "";
    let lowOn = true;
    let modeNow: Mode = "overview";
    let moodNow: MoodId = lookRef.current.mood;
    const disposeRoot = (root: THREE.Object3D) => {
      const mats = new Set<THREE.Material>();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
      });
      mats.forEach((m) => {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      });
    };
    const build = (l: Look) => {
      const curtains = MOODS[l.mood].curtains;
      const key = lookKey(l, curtains);
      if (key === currentKey) return;
      if (built) {
        three.remove(built.root);
        disposeRoot(built.root);
        clearGeoCache();
      }
      built = buildHouse(scene, l, { curtainsDrawn: curtains === "drawn" });
      blockers = built.blockers;
      three.add(built.root);
      currentKey = key;
      applyVisibility();
      applyMood(l.mood);
      renderer.shadowMap.needsUpdate = true;
    };
    // Light, sky and lamps for a mood.
    const applyMood = (id: MoodId) => {
      moodNow = id;
      const m = MOODS[id];
      sun.color.set(m.sun.color);
      sun.intensity = m.sun.intensity;
      const el2 = m.sun.elevation,
        az = m.sun.azimuth;
      sun.position.set(centre.x + Math.sin(az) * Math.cos(el2) * S * 1.4, Math.sin(el2) * S * 1.4 + 0.5, centre.z - Math.cos(az) * Math.cos(el2) * S * 1.4);
      hemi.color.set(m.hemi.sky);
      hemi.groundColor.set(m.hemi.ground);
      hemi.intensity = m.hemi.intensity;
      fill.intensity = id === "morning" ? 0.5 : 0.15;
      three.environmentIntensity = m.env;
      renderer.toneMappingExposure = m.exposure;
      (three.background as THREE.Color).set(m.bg);
      if (built) {
        for (const l of built.lamps) l.intensity = m.lamps * 9;
        built.root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (mat.userData?.lamp) (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + m.lamps * 1.6;
        });
      }
      renderer.shadowMap.needsUpdate = true;
    };
    const applyVisibility = () => {
      if (!built) return;
      const walk = modeNow === "walk";
      built.fullWalls.visible = walk || !lowOn;
      built.lowWalls.visible = !walk && lowOn;
      built.ceilings.visible = walk;
      for (const o of built.upper) o.visible = walk || !lowOn;
      renderer.shadowMap.needsUpdate = true;
    };
    build(lookRef.current);

    // ---------- labels ----------
    const labelData = roomNames.map((name) => {
      const parts = scene.rooms.filter((r) => r.name === name);
      const big = parts.reduce((a, b) => (a.w * a.d >= b.w * b.d ? a : b));
      return { name, pos: new THREE.Vector3(big.x + big.w / 2, 1.3, big.y + big.d / 2), size: `${big.w.toFixed(1)} × ${big.d.toFixed(1)} m` };
    });
    const v = new THREE.Vector3();
    const placeLabels = () => {
      const box = labelsRef.current;
      if (!box) return;
      const kids = box.children as HTMLCollectionOf<HTMLElement>;
      for (let i = 0; i < labelData.length; i++) {
        const k = kids[i];
        if (!k) continue;
        if (modeNow === "walk") {
          k.style.display = "none";
          continue;
        }
        v.copy(labelData[i].pos).project(camera);
        const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
        k.style.display = vis ? "" : "none";
        k.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px)`;
      }
    };

    // ---------- walk-through ----------
    let yaw = 0,
      pitch = 0;
    const keys = new Set<string>();
    const stick = { x: 0, y: 0 };
    const blocked = (x: number, y: number) => {
      if (x < BX0 - 0.5 || y < BY0 - 0.5 || x > BX1 + 0.5 || y > BY1 + 0.5) return true;
      for (const b of blockers) {
        if (b.kind === "box") {
          if (x > b.x1 - RADIUS && x < b.x2 + RADIUS && y > b.y1 - RADIUS && y < b.y2 + RADIUS) return true;
        } else {
          const dx = b.bx - b.ax,
            dy = b.by - b.ay;
          const L2 = dx * dx + dy * dy || 1;
          const k = Math.max(0, Math.min(1, ((x - b.ax) * dx + (y - b.ay) * dy) / L2));
          if (Math.hypot(x - (b.ax + dx * k), y - (b.ay + dy * k)) < RADIUS + b.r) return true;
        }
      }
      return false;
    };
    const roomAt = (x: number, y: number) => scene.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d)?.name ?? "";
    const freeSpot = (x: number, y: number) => {
      if (!blocked(x, y)) return { x, y };
      for (let rad = 0.2; rad < 3; rad += 0.2)
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          const nx = x + Math.cos(a) * rad,
            ny = y + Math.sin(a) * rad;
          if (!blocked(nx, ny)) return { x: nx, y: ny };
        }
      return { x, y };
    };
    const lookAtCentre = (x: number, y: number) => {
      yaw = Math.atan2(-(centre.x - x), -(centre.z - y));
      pitch = 0;
    };
    const goTo = (name: string) => {
      const parts = scene.rooms.filter((r) => r.name === name);
      if (!parts.length) return;
      const r = parts.reduce((a, b) => (a.w * a.d >= b.w * b.d ? a : b));
      if (modeNow === "overview") {
        orbit.target.set(r.x + r.w / 2, 0, r.y + r.d / 2);
        const dist = Math.max(r.w, r.d) * 1.6 + 3;
        camera.position.set(r.x + r.w / 2 + dist * 0.45, dist * 0.95, r.y + r.d / 2 + dist * 0.8);
        orbit.update();
        return;
      }
      // Stand near a door looking in.
      const door = sceneDoors.find((o) => (o.dir === "h" ? Math.abs(o.y - r.y) < 0.35 || Math.abs(o.y - (r.y + r.d)) < 0.35 : Math.abs(o.x - r.x) < 0.35 || Math.abs(o.x - (r.x + r.w)) < 0.35) && o.x >= r.x - 0.35 && o.x <= r.x + r.w + 0.35 && o.y >= r.y - 0.35 && o.y <= r.y + r.d + 0.35);
      let px = r.x + r.w / 2,
        py = r.y + r.d / 2;
      if (door) {
        const inX = door.dir === "v" ? (Math.abs(door.x - r.x) < Math.abs(door.x - (r.x + r.w)) ? 0.5 : -0.5) : 0;
        const inY = door.dir === "h" ? (Math.abs(door.y - r.y) < Math.abs(door.y - (r.y + r.d)) ? 0.5 : -0.5) : 0;
        px = door.x + inX;
        py = door.y + inY;
      } else {
        // No door (an open kitchen, say): stand just outside its most open side, looking in.
        const cover = (horiz: boolean, line: number, lo: number, hi: number) =>
          scene.walls.reduce((sum, w) => {
            const wh = Math.abs(w.a[1] - w.b[1]) < 0.05,
              wv = Math.abs(w.a[0] - w.b[0]) < 0.05;
            if (horiz ? !wh : !wv) return sum;
            if (Math.abs((horiz ? w.a[1] : w.a[0]) - line) > 0.3) return sum;
            const a = horiz ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]),
              b = horiz ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
            return sum + Math.max(0, Math.min(hi, b) - Math.max(lo, a));
          }, 0) / (hi - lo);
        const sides = [
          { c: cover(true, r.y, r.x, r.x + r.w), x: r.x + r.w / 2, y: r.y - 0.8 },
          { c: cover(true, r.y + r.d, r.x, r.x + r.w), x: r.x + r.w / 2, y: r.y + r.d + 0.8 },
          { c: cover(false, r.x, r.y, r.y + r.d), x: r.x - 0.8, y: r.y + r.d / 2 },
          { c: cover(false, r.x + r.w, r.y, r.y + r.d), x: r.x + r.w + 0.8, y: r.y + r.d / 2 },
        ].sort((a, b) => a.c - b.c);
        if (sides[0].c < 0.7) {
          px = sides[0].x;
          py = sides[0].y;
        }
      }
      const p = freeSpot(px, py);
      camera.position.set(p.x, EYE, p.y);
      yaw = Math.atan2(-(r.x + r.w / 2 - p.x), -(r.y + r.d / 2 - p.y));
      pitch = -0.15;
      setHere(roomAt(p.x, p.y));
    };
    const startWalk = () => {
      const main = sceneDoors.find((d) => d.main);
      const living = scene.rooms.find((r) => r.type === "living" || r.type === "living_dining") ?? scene.rooms[0];
      if (main) {
        // step inside the home from the main door
        const insideCandidates = [
          { x: main.x, y: main.y + 0.6 },
          { x: main.x, y: main.y - 0.6 },
          { x: main.x + 0.6, y: main.y },
          { x: main.x - 0.6, y: main.y },
        ].filter((c) => roomAt(c.x, c.y));
        const c = insideCandidates.find((c) => !blocked(c.x, c.y)) ?? insideCandidates[0];
        if (c) {
          const p = freeSpot(c.x, c.y);
          camera.position.set(p.x, EYE, p.y);
          lookAtCentre(p.x, p.y);
          setHere(roomAt(p.x, p.y));
          return;
        }
      }
      goTo(living.name);
    };
    const setModeInner = (m: Mode) => {
      modeNow = m;
      orbit.enabled = m === "overview";
      camera.fov = m === "walk" ? 70 : 45;
      camera.near = m === "walk" ? 0.05 : 0.1;
      camera.updateProjectionMatrix();
      if (m === "walk") startWalk();
      else {
        camera.position.copy(overviewPos());
        orbit.target.copy(centre);
        orbit.update();
      }
      applyVisibility();
    };

    // Drag to look (walk mode).
    let dragId: number | null = null,
      lx = 0,
      ly = 0;
    const onDown = (e: PointerEvent) => {
      if (modeNow !== "walk") return;
      dragId = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (modeNow !== "walk" || e.pointerId !== dragId) return;
      const k = e.pointerType === "touch" ? 0.006 : 0.004;
      yaw -= (e.clientX - lx) * k;
      pitch = Math.max(-1.1, Math.min(1.1, pitch - (e.clientY - ly) * k));
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === dragId) dragId = null;
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);
    const kd = (e: KeyboardEvent) => {
      if (modeNow !== "walk") return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "q", "e"].includes(k)) {
        keys.add(k);
        e.preventDefault();
      }
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // ---------- loop ----------
    const clock = new THREE.Clock();
    let raf = 0;
    let lastRoom = "";
    const dir = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      if (modeNow === "walk") {
        let fwd = 0,
          side = 0,
          turn = 0;
        if (keys.has("w") || keys.has("arrowup")) fwd += 1;
        if (keys.has("s") || keys.has("arrowdown")) fwd -= 1;
        if (keys.has("a")) side -= 1;
        if (keys.has("d")) side += 1;
        if (keys.has("arrowleft") || keys.has("q")) turn += 1;
        if (keys.has("arrowright") || keys.has("e")) turn -= 1;
        fwd += -stick.y;
        side += stick.x;
        yaw += turn * dt * 1.8;
        const speed = 1.7 * dt;
        const fx = -Math.sin(yaw),
          fz = -Math.cos(yaw);
        const rx = Math.cos(yaw),
          rz = -Math.sin(yaw);
        const mx = (fx * fwd + rx * side) * speed,
          mz = (fz * fwd + rz * side) * speed;
        const p = camera.position;
        if (mx && !blocked(p.x + mx, p.z)) p.x += mx;
        if (mz && !blocked(p.x, p.z + mz)) p.z += mz;
        p.y = EYE;
        dir.set(Math.sin(yaw) * -Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        camera.lookAt(p.x + dir.x, p.y + dir.y, p.z + dir.z);
        const rn = roomAt(p.x, p.z);
        if (rn && rn !== lastRoom) {
          lastRoom = rn;
          setHere(rn);
          roomRef.current?.(rn);
        }
      } else orbit.update();
      renderer.render(three, camera);
      placeLabels();
    };
    // A picture from the standard dollhouse angle, whatever the viewer is showing right now.
    const snapshot = () =>
      new Promise<Blob | null>((resolve) => {
        const w = el.clientWidth,
          h = el.clientHeight;
        const savePos = camera.position.clone(),
          saveTarget = orbit.target.clone(),
          saveFov = camera.fov;
        camera.position.copy(overviewPos());
        orbit.target.copy(centre);
        camera.fov = 45;
        built!.fullWalls.visible = false;
        built!.lowWalls.visible = true;
        built!.ceilings.visible = false;
        renderer.shadowMap.needsUpdate = true;
        renderer.setPixelRatio(1);
        renderer.setSize(1600, 1000, false);
        camera.aspect = 1.6;
        camera.updateProjectionMatrix();
        camera.lookAt(centre);
        renderer.render(three, camera);
        renderer.domElement.toBlob((b) => resolve(b), "image/jpeg", 0.9);
        // restore
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.fov = saveFov;
        camera.updateProjectionMatrix();
        camera.position.copy(savePos);
        orbit.target.copy(saveTarget);
        applyVisibility();
      });
    // A picture of exactly what the camera sees now.
    const shot = () =>
      new Promise<Blob | null>((resolve) => {
        const w = el.clientWidth,
          h = el.clientHeight;
        renderer.setPixelRatio(1);
        renderer.setSize(1600, 1000, false);
        const saveAspect = camera.aspect;
        camera.aspect = 1.6;
        camera.updateProjectionMatrix();
        renderer.render(three, camera);
        renderer.domElement.toBlob((b) => resolve(b), "image/jpeg", 0.92);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
        renderer.setSize(w, h, false);
        camera.aspect = saveAspect;
        camera.updateProjectionMatrix();
      });
    const getCamera = (): Shot["cam"] => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const t = modeNow === "walk" ? camera.position.clone().add(dir) : orbit.target.clone();
      const r = (n: number) => Math.round(n * 1000) / 1000;
      return { p: [r(camera.position.x), r(camera.position.y), r(camera.position.z)], t: [r(t.x), r(t.y), r(t.z)], fov: camera.fov, walk: modeNow === "walk" };
    };
    const setCamera = (cam: Shot["cam"]) => {
      if (cam.walk !== (modeNow === "walk")) {
        setModeInner(cam.walk ? "walk" : "overview");
        skipMode.current = true;
        setMode(cam.walk ? "walk" : "overview");
      }
      camera.position.set(...cam.p);
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
      if (cam.walk) {
        const dx = cam.t[0] - cam.p[0],
          dy = cam.t[1] - cam.p[1],
          dz = cam.t[2] - cam.p[2];
        yaw = Math.atan2(-dx, -dz);
        pitch = Math.atan2(dy, Math.hypot(dx, dz));
      } else {
        orbit.target.set(...cam.t);
        orbit.update();
      }
    };
    readyRef.current?.({ snapshot, shot, getCamera, setCamera });
    firstFrameRef.current &&
      requestAnimationFrame(() =>
        requestAnimationFrame(async () => {
          const cb = firstFrameRef.current;
          if (cb) cb(await snapshot());
        }),
      );
    tick();

    const onResize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    api.current = {
      setMode: setModeInner,
      setLow: (b) => {
        lowOn = b;
        applyVisibility();
      },
      setLook: (l) => {
        build(l);
        if (l.mood !== moodNow) applyMood(l.mood);
      },
      goTo,
      snapshot,
      stick,
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      orbit.dispose();
      pmrem.dispose();
      three.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mt) => {
            (mt as THREE.MeshStandardMaterial).map?.dispose();
            mt.dispose();
          });
        }
      });
      clearGeoCache();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // The scene and first style are fixed for the life of the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    if (skipMode.current) {
      skipMode.current = false;
      return;
    }
    api.current?.setMode(mode);
  }, [mode]);
  useEffect(() => {
    api.current?.setLow(lowWalls);
  }, [lowWalls]);
  const lookJson = JSON.stringify({ t: look.theme, c: look.custom, r: look.rooms, m: look.mood });
  useEffect(() => {
    api.current?.setLook(lookRef.current);
  }, [lookJson]);

  // ---------- joystick ----------
  const stickBase = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickMove = useCallback((e: React.PointerEvent) => {
    const b = stickBase.current!.getBoundingClientRect();
    const r = b.width / 2;
    let x = (e.clientX - (b.left + r)) / r,
      y = (e.clientY - (b.top + r)) / r;
    const l = Math.hypot(x, y);
    if (l > 1) (x /= l), (y /= l);
    setKnob({ x, y });
    if (api.current) (api.current.stick.x = x), (api.current.stick.y = y);
  }, []);
  const stickEnd = useCallback(() => {
    setKnob({ x: 0, y: 0 });
    if (api.current) (api.current.stick.x = 0), (api.current.stick.y = 0);
  }, []);

  const fullscreen = () => {
    const box = host.current?.parentElement;
    if (!box) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else box.requestFullscreen?.().catch(() => {});
  };

  if (failed) return <p className="rounded-xl border border-line bg-paper p-4 text-sm text-muted">This device can&apos;t show 3D (WebGL is off). Try Chrome or Safari on a computer or a recent phone.</p>;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-[#f3eee6]" style={{ height }}>
      <div ref={host} className="absolute inset-0" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0">
        {roomNames.map((n) => {
          const r = scene.rooms.filter((x) => x.name === n).reduce((a, b) => (a.w * a.d >= b.w * b.d ? a : b));
          return (
            <button
              key={n}
              type="button"
              onClick={() => {
                setMode("walk");
                setTimeout(() => api.current?.goTo(n), 30);
              }}
              className="pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-semibold text-white shadow backdrop-blur transition hover:bg-ink"
              title={`Walk into ${n}`}
            >
              {n} <span className="font-normal opacity-70">{r.w.toFixed(1)}×{r.d.toFixed(1)}</span>
            </button>
          );
        })}
      </div>

      {/* top bar */}
      <div className="absolute inset-x-2 top-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-paper/90 p-1 shadow backdrop-blur">
          {(["overview", "walk"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${mode === m ? "bg-ink text-white" : "text-ink hover:bg-brass-soft"}`}>
              {m === "overview" ? "Dollhouse" : "Walk through"}
            </button>
          ))}
        </div>
        {mode === "overview" && (
          <button type="button" onClick={() => setLowWalls((b) => !b)} className="rounded-full bg-paper/90 px-3 py-2 text-xs font-semibold shadow backdrop-blur hover:bg-brass-soft">
            {lowWalls ? "Full walls" : "Cut walls"}
          </button>
        )}
        {explore && (
          <>
            <select value={tryTheme ?? lookProp.theme} onChange={(e) => setTryTheme(e.target.value === lookProp.theme ? null : e.target.value)} className="rounded-full border-0 bg-paper/90 px-3 py-2 text-xs font-semibold shadow backdrop-blur" aria-label="Theme">
              {!THEMES[lookProp.theme] && <option value={lookProp.theme}>{lookProp.custom?.label ?? "Designer's theme"}</option>}
              {Object.values(THEMES).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.id === lookProp.theme ? " (designer's pick)" : ""}
                </option>
              ))}
            </select>
            <select value={tryMood ?? lookProp.mood} onChange={(e) => setTryMood(e.target.value as MoodId)} className="rounded-full border-0 bg-paper/90 px-3 py-2 text-xs font-semibold shadow backdrop-blur" aria-label="Mood">
              {MOOD_IDS.map((m) => (
                <option key={m} value={m}>
                  {MOODS[m].label}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="button" onClick={fullscreen} className="ml-auto rounded-full bg-paper/90 px-3 py-2 text-xs font-semibold shadow backdrop-blur hover:bg-brass-soft" title="Full screen">
          ⛶
        </button>
      </div>

      {mode === "walk" && (
        <>
          <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-2">
            <div className={`flex max-w-full gap-1.5 ${touch ? "overflow-x-auto pb-1 [scrollbar-width:none]" : "flex-wrap"}`}>
              {roomNames.map((n) => (
                <button key={n} type="button" onClick={() => api.current?.goTo(n)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow backdrop-blur ${here === n ? "bg-brass text-white" : "bg-paper/90 text-ink hover:bg-brass-soft"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {!touch && <p className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded-full bg-ink/60 px-3 py-1 text-[11px] text-white">Drag to look · W A S D or arrow keys to move</p>}
          {touch && (
            <div
              ref={stickBase}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                stickMove(e);
              }}
              onPointerMove={(e) => e.buttons && stickMove(e)}
              onPointerUp={stickEnd}
              onPointerCancel={stickEnd}
              className="absolute bottom-16 left-4 h-28 w-28 touch-none rounded-full border-2 border-white/70 bg-ink/25 backdrop-blur"
            >
              <div className="absolute h-12 w-12 rounded-full bg-white/90 shadow" style={{ left: `calc(50% - 24px + ${knob.x * 32}px)`, top: `calc(50% - 24px + ${knob.y * 32}px)` }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
