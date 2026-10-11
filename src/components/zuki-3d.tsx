"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mouthLevel } from "@/lib/speech-client";
import type { ZukiState } from "./zuki";

/**
 * Zuki in 3D: a little brass house with a lamp on its roof.
 * It looks at your finger or mouse, blinks, bobs, talks with its mouth, and reacts to its state.
 * Tap it and it boings; drag sideways and it spins, then settles back.
 */
const BRASS = 0xa87b45;
const CREAM = 0xf1dfc4;
const INK = 0x2b241e;
const CLAY = 0xb4553a;
const OLIVE = 0x6f8a5f;
const GOLD = 0xf0c868;

export default function Zuki3D({
  state,
  size,
  onTap,
  disabled,
  onReady,
  onFail,
}: {
  state: ZukiState;
  size: number;
  onTap: () => void;
  disabled?: boolean;
  onReady?: () => void;
  onFail?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const kick = useRef<(kind: "tap" | "happy") => void>(() => {});

  // A burst of joy whenever Zuki becomes happy.
  useEffect(() => {
    if (state === "happy") kick.current("happy");
  }, [state]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      onFail?.();
      return;
    }
    const W = Math.round(size * 1.25);
    const H = size;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "pan-y";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 50);
    camera.position.set(0, 0.4, 6.1);
    camera.lookAt(0, 0.38, 0);

    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b5a45, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe2b0, 0.8);
    rim.position.set(-3, 2, -3);
    scene.add(rim);

    const mat = {
      brass: new THREE.MeshStandardMaterial({
        color: BRASS,
        metalness: 0.55,
        roughness: 0.32,
      }),
      cream: new THREE.MeshStandardMaterial({
        color: CREAM,
        metalness: 0,
        roughness: 0.75,
      }),
      ink: new THREE.MeshStandardMaterial({
        color: INK,
        metalness: 0,
        roughness: 0.62,
      }),
      roof: new THREE.MeshStandardMaterial({
        color: 0x241d18,
        metalness: 0,
        roughness: 0.55,
        flatShading: true,
        envMapIntensity: 0.35,
      }),
      eye: new THREE.MeshStandardMaterial({
        color: 0x1b1714,
        metalness: 0.2,
        roughness: 0.15,
      }),
      white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      cheek: new THREE.MeshBasicMaterial({
        color: 0xe9a58f,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
      mouth: new THREE.MeshStandardMaterial({
        color: 0x4a1f1a,
        roughness: 0.6,
      }),
      lamp: new THREE.MeshStandardMaterial({
        color: GOLD,
        emissive: new THREE.Color(GOLD),
        emissiveIntensity: 0.6,
        roughness: 0.3,
      }),
      ring: new THREE.MeshBasicMaterial({
        color: OLIVE,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      dot: new THREE.MeshBasicMaterial({
        color: OLIVE,
        transparent: true,
        opacity: 0,
      }),
    };
    const geos: THREE.BufferGeometry[] = [];
    const g = <T extends THREE.BufferGeometry>(x: T) => (geos.push(x), x);

    // ---- Build Zuki ----
    const root = new THREE.Group(); // bob, squash, spin
    scene.add(root);
    const body = new THREE.Group(); // turns to look at you
    root.add(body);

    const house = new THREE.Mesh(
      g(new RoundedBoxGeometry(1.3, 1.22, 0.92, 6, 0.3)),
      mat.brass,
    );
    body.add(house);
    const face = new THREE.Mesh(
      g(new RoundedBoxGeometry(1.04, 0.98, 0.1, 5, 0.24)),
      mat.cream,
    );
    face.position.set(0, -0.02, 0.44);
    body.add(face);

    const roof = new THREE.Mesh(
      g(new THREE.ConeGeometry(0.98, 0.78, 4, 1)),
      mat.roof,
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.8);
    roof.position.y = 0.98;
    body.add(roof);
    const stem = new THREE.Mesh(
      g(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 10)),
      mat.ink,
    );
    stem.position.y = 1.45;
    body.add(stem);
    const lamp = new THREE.Mesh(
      g(new THREE.SphereGeometry(0.1, 24, 16)),
      mat.lamp,
    );
    lamp.position.y = 1.64;
    body.add(lamp);
    const lampLight = new THREE.PointLight(GOLD, 0.6, 3);
    lampLight.position.y = 1.7;
    body.add(lampLight);

    const faceZ = 0.5;
    const eyeGeo = g(new THREE.SphereGeometry(0.085, 24, 16));
    const glintGeo = g(new THREE.SphereGeometry(0.026, 12, 8));
    const makeEye = (x: number) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0.1, faceZ);
      const ball = new THREE.Mesh(eyeGeo, mat.eye);
      ball.scale.set(1, 1.28, 0.55);
      const glint = new THREE.Mesh(glintGeo, mat.white);
      glint.position.set(0.028, 0.05, 0.045);
      grp.add(ball, glint);
      body.add(grp);
      return grp;
    };
    const eyeL = makeEye(-0.23);
    const eyeR = makeEye(0.23);

    // Happy eyes: little arcs (^ ^).
    const arcGeo = g(new THREE.TorusGeometry(0.075, 0.02, 8, 20, Math.PI));
    const happyL = new THREE.Mesh(arcGeo, mat.eye);
    const happyR = new THREE.Mesh(arcGeo, mat.eye);
    happyL.position.set(-0.23, 0.08, faceZ);
    happyR.position.set(0.23, 0.08, faceZ);
    body.add(happyL, happyR);

    // Worried brows.
    const browGeo = g(new THREE.CapsuleGeometry(0.018, 0.12, 4, 8));
    const browL = new THREE.Mesh(browGeo, mat.eye);
    const browR = new THREE.Mesh(browGeo, mat.eye);
    browL.position.set(-0.23, 0.3, faceZ);
    browR.position.set(0.23, 0.3, faceZ);
    browL.rotation.z = Math.PI / 2 + 0.35;
    browR.rotation.z = Math.PI / 2 - 0.35;
    body.add(browL, browR);

    // Mouth: a smile, an open talking mouth, and a frown.
    const smile = new THREE.Mesh(
      g(new THREE.TorusGeometry(0.12, 0.022, 8, 24, Math.PI)),
      mat.eye,
    );
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.12, faceZ);
    body.add(smile);
    const open = new THREE.Mesh(
      g(new THREE.SphereGeometry(0.1, 24, 16)),
      mat.mouth,
    );
    open.position.set(0, -0.2, faceZ - 0.01);
    body.add(open);
    const frown = new THREE.Mesh(
      g(new THREE.TorusGeometry(0.09, 0.02, 8, 20, Math.PI)),
      mat.eye,
    );
    frown.position.set(0, -0.26, faceZ);
    body.add(frown);

    const cheekGeo = g(new THREE.CircleGeometry(0.075, 24));
    const cheekL = new THREE.Mesh(cheekGeo, mat.cheek);
    const cheekR = new THREE.Mesh(cheekGeo, mat.cheek);
    cheekL.position.set(-0.36, -0.1, faceZ + 0.002);
    cheekR.position.set(0.36, -0.1, faceZ + 0.002);
    body.add(cheekL, cheekR);

    // Arms on shoulder pivots, and two little feet.
    const armGeo = g(new THREE.CapsuleGeometry(0.075, 0.34, 6, 12));
    const makeArm = (side: 1 | -1) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.66 * side, -0.05, 0.05);
      const arm = new THREE.Mesh(armGeo, mat.brass);
      arm.position.set(0.1 * side, -0.2, 0);
      arm.rotation.z = 0.45 * side;
      pivot.add(arm);
      root.add(pivot);
      return pivot;
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);
    const footGeo = g(new RoundedBoxGeometry(0.3, 0.14, 0.34, 4, 0.06));
    const footL = new THREE.Mesh(footGeo, mat.ink);
    const footR = new THREE.Mesh(footGeo, mat.ink);
    footL.position.set(-0.3, -0.68, 0.05);
    footR.position.set(0.3, -0.68, 0.05);
    root.add(footL, footR);

    // Listening rings and thinking dots.
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(
        g(new THREE.TorusGeometry(0.95, 0.02, 8, 64)),
        mat.ring.clone(),
      );
      r.position.set(0, 0.15, -0.1);
      scene.add(r);
      return r;
    });
    const dotGeo = g(new THREE.SphereGeometry(0.055, 12, 8));
    const dots = [0, 1, 2].map(() => {
      const d = new THREE.Mesh(dotGeo, mat.dot.clone());
      scene.add(d);
      return d;
    });

    // A soft shadow on the floor.
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext("2d")!;
    const grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(40,30,20,0.35)");
    grad.addColorStop(1, "rgba(40,30,20,0)");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadow = new THREE.Mesh(
      g(new THREE.PlaneGeometry(2.2, 0.7)),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.78;
    scene.add(shadow);

    // ---- Interaction ----
    const look = { x: 0, y: 0, tx: 0, ty: 0, lastMove: 0 };
    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.42;
      look.tx = Math.max(
        -1,
        Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.45)),
      );
      look.ty = Math.max(
        -1,
        Math.min(1, (e.clientY - cy) / (window.innerHeight * 0.45)),
      );
      look.lastMove = performance.now();
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const phys = { squash: 0, squashV: 0, spin: 0, spinV: 0, hop: 0, cheer: 0 };
    kick.current = (kind) => {
      if (kind === "tap") phys.squashV += 9;
      else {
        phys.hop = 1;
        phys.cheer = 1;
      }
    };
    let down: { x: number; y: number; t: number; dragging: boolean } | null =
      null;
    const cvs = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      down = {
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        dragging: false,
      };
      onMove(e);
    };
    const onDrag = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (
        !down.dragging &&
        Math.abs(dx) > 8 &&
        Math.abs(dx) > Math.abs(e.clientY - down.y)
      )
        down.dragging = true;
      if (down.dragging) {
        phys.spinV = dx * 0.012;
        phys.spin += dx * 0.012;
        down.x = e.clientX;
      }
    };
    const onUp = () => {
      if (down && !down.dragging && !disabledRef.current) {
        kick.current("tap");
        tapRef.current();
      }
      down = null;
    };
    cvs.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onDrag, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", () => (down = null));

    // ---- Animation ----
    let raf = 0;
    let running = true;
    let visible = true;
    let last = performance.now();
    let nextBlink = last + 1500;
    let blinkUntil = 0;
    let wander = { x: 0, y: 0, at: 0 };
    let ready = false;
    const lampColor = new THREE.Color(GOLD);
    const tmp = new THREE.Color();
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!running || !visible) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const st = stateRef.current;

      // Where to look: at you, or around the room if you've been still for a while.
      let tx = look.tx;
      let ty = look.ty;
      if (now - look.lastMove > 4000) {
        if (now > wander.at)
          wander = {
            x: (Math.random() - 0.5) * 1.2,
            y: (Math.random() - 0.5) * 0.6,
            at: now + 2000 + Math.random() * 2500,
          };
        tx = wander.x;
        ty = wander.y;
      }
      if (st === "thinking") {
        tx = 0.45;
        ty = -0.8;
      }
      look.x = lerp(look.x, tx, 1 - Math.pow(0.002, dt));
      look.y = lerp(look.y, ty, 1 - Math.pow(0.002, dt));

      // Springs: tap squash, drag spin settling back.
      phys.squashV += (-140 * phys.squash - 9 * phys.squashV) * dt;
      phys.squash += phys.squashV * dt;
      if (!down?.dragging) {
        phys.spinV += (-30 * phys.spin - 5 * phys.spinV) * dt;
        phys.spin += phys.spinV * dt;
      }
      phys.hop = Math.max(0, phys.hop - dt * 0.8);
      phys.cheer = Math.max(0, phys.cheer - dt * 0.5);

      // Body motion per state.
      const speed = st === "speaking" ? 6 : st === "thinking" ? 4 : 2;
      let bob = Math.sin(t * speed) * (st === "speaking" ? 0.03 : 0.045);
      if (phys.hop > 0)
        bob += Math.abs(Math.sin(phys.hop * Math.PI * 3)) * 0.35 * phys.hop;
      root.position.y = bob;
      const s = phys.squash * 0.12;
      root.scale.set(1 + s, 1 - s, 1 + s);
      root.rotation.y = phys.spin;
      root.rotation.z =
        st === "listening"
          ? Math.sin(t * 2.2) * 0.06
          : st === "concerned"
            ? -0.08 + Math.sin(t * 1.5) * 0.02
            : 0;
      body.rotation.y = look.x * 0.7;
      body.rotation.x = look.y * 0.28;
      shadow.scale.setScalar(1 - bob * 0.8);

      // Eyes: follow, blink, widen when listening.
      if (now > nextBlink) {
        blinkUntil = now + 140;
        nextBlink = now + 2200 + Math.random() * 3200;
      }
      const blink = now < blinkUntil ? 0.1 : 1;
      const wide = st === "listening" ? 1.15 : st === "concerned" ? 0.92 : 1;
      const happy = st === "happy";
      for (const [eye, x] of [
        [eyeL, -0.23],
        [eyeR, 0.23],
      ] as const) {
        eye.visible = !happy;
        eye.position.x = x + look.x * 0.05;
        eye.position.y = 0.1 - look.y * 0.04;
        eye.scale.set(wide, wide * blink, 1);
      }
      happyL.visible = happyR.visible = happy;
      browL.visible = browR.visible = st === "concerned";

      // Mouth: talk with the voice, smile otherwise, frown when worried.
      const m = st === "speaking" ? mouthLevel(now) : 0;
      open.visible = st === "speaking" || st === "listening";
      if (st === "listening") open.scale.set(0.55, 0.5, 0.4);
      else open.scale.set(0.9 + m * 0.3, 0.15 + m * 0.85, 0.4);
      smile.visible = !open.visible && st !== "concerned";
      smile.scale.setScalar(happy ? 1.35 : 1);
      frown.visible = st === "concerned";
      cheekL.material.opacity = happy ? 0.85 : 0.55;

      // Arms.
      const wave = st === "speaking" ? Math.sin(t * 7) * 0.35 : 0;
      const cheer = happy || phys.cheer > 0 ? 2.3 + Math.sin(t * 12) * 0.3 : 0;
      armL.rotation.z = lerp(
        armL.rotation.z,
        cheer ? -cheer : st === "concerned" ? 0.35 : Math.sin(t * 1.6) * 0.08,
        0.15,
      );
      armR.rotation.z = lerp(
        armR.rotation.z,
        cheer
          ? cheer
          : st === "listening"
            ? 1.9
            : st === "concerned"
              ? -0.35
              : 0.2 + wave,
        0.15,
      );

      // Lamp colour by mood.
      const target =
        st === "listening"
          ? CLAY
          : st === "thinking"
            ? OLIVE
            : st === "concerned"
              ? CLAY
              : GOLD;
      lampColor.lerp(tmp.set(target), 0.12);
      mat.lamp.color.copy(lampColor);
      mat.lamp.emissive.copy(lampColor);
      const pulse =
        st === "listening" || st === "thinking"
          ? 0.6 + Math.sin(t * 6) * 0.4
          : happy
            ? 1.2
            : 0.55;
      mat.lamp.emissiveIntensity = pulse;
      lampLight.color.copy(lampColor);
      lampLight.intensity = pulse * 0.8;

      // Listening rings spread out; thinking dots circle above.
      rings.forEach((r, i) => {
        const p = (t * 0.8 + i / 3) % 1;
        const on = st === "listening";
        r.scale.setScalar(0.9 + p * 0.7);
        (r.material as THREE.MeshBasicMaterial).opacity = on
          ? (1 - p) * 0.45
          : 0;
      });
      dots.forEach((d, i) => {
        const a = t * 3 + (i * Math.PI * 2) / 3;
        d.position.set(
          Math.cos(a) * 0.42,
          1.78 + Math.sin(t * 4 + i) * 0.05,
          Math.sin(a) * 0.35,
        );
        (d.material as THREE.MeshBasicMaterial).opacity =
          st === "thinking" ? 0.9 : 0;
      });

      renderer.render(scene, camera);
      if (!ready) {
        ready = true;
        onReady?.();
      }
    };
    raf = requestAnimationFrame(frame);

    // Pause when off screen or the tab is hidden.
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    const onVis = () => {
      running = document.visibilityState === "visible";
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);
    const onLost = (e: Event) => {
      e.preventDefault();
      onFail?.();
    };
    cvs.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointermove", onDrag);
      window.removeEventListener("pointerup", onUp);
      cvs.removeEventListener("pointerdown", onDown);
      cvs.removeEventListener("webglcontextlost", onLost);
      geos.forEach((x) => x.dispose());
      Object.values(mat).forEach((x) => x.dispose());
      rings.forEach((r) => (r.material as THREE.Material).dispose());
      dots.forEach((d) => (d.material as THREE.Material).dispose());
      shadowTex.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      cvs.remove();
    };
    // Size changes rebuild the scene; everything else is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  return (
    <div ref={host} style={{ width: Math.round(size * 1.25), height: size }} />
  );
}
