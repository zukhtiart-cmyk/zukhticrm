"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mouthLevel } from "@/lib/speech-client";
import type { ZukiState } from "./zuki";

/**
 * Zuki in 3D: a cheerful young interior designer in an olive apron.
 * It looks at your finger or mouse, blinks, bobs, talks with its mouth, and reacts to its state.
 * Tap it and it boings; drag sideways and it spins, then settles back.
 */
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
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "pan-y";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.45;

    const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 50);
    camera.position.set(0, 0.4, 6.1);
    camera.lookAt(0, 0.38, 0);

    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b5a45, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe2b0, 0.8);
    rim.position.set(-3, 2, -3);
    scene.add(rim);

    const std = (
      color: number,
      roughness = 0.6,
      extra: THREE.MeshStandardMaterialParameters = {},
    ) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: 0,
        ...extra,
      });
    const mat = {
      skin: std(0xcf9468, 0.62),
      skinShade: std(0xb97c52, 0.7),
      hair: std(0x2a1c15, 0.45),
      shirt: std(0x58779a, 0.85),
      apron: std(0x56704f, 0.9),
      apronDark: std(0x475e41, 0.9),
      pants: std(0x3a2c24, 0.8),
      shoe: std(0x6b4a2f, 0.55),
      pencil: std(0xd9a441, 0.5),
      eraser: std(0xe59a9a, 0.7),
      wood: std(0xf1d8b0, 0.7),
      tape: std(0xe2b84a, 0.4, { metalness: 0.2 }),
      sclera: std(0xfffaf2, 0.3),
      iris: std(0x5a3622, 0.25),
      eye: std(0x1b1714, 0.12),
      white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      cheek: new THREE.MeshBasicMaterial({
        color: 0xe58f7a,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
      mouth: std(0x5a2620, 0.6),
      lamp: std(GOLD, 0.35, {
        metalness: 0.4,
        emissive: new THREE.Color(GOLD),
        emissiveIntensity: 0.4,
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
    const mesh = (
      geo: THREE.BufferGeometry,
      m: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      return o;
    };

    // ---- Build Zuki: a young designer in an olive apron ----
    const root = new THREE.Group(); // bob, squash, spin
    scene.add(root);
    const torso = new THREE.Group();
    root.add(torso);

    // Legs and shoes.
    const legGeo = g(new THREE.CapsuleGeometry(0.1, 0.2, 6, 12));
    torso.add(
      mesh(legGeo, mat.pants, -0.15, -0.52, 0),
      mesh(legGeo, mat.pants, 0.15, -0.52, 0),
    );
    const shoeGeo = g(new RoundedBoxGeometry(0.24, 0.13, 0.36, 4, 0.06));
    torso.add(
      mesh(shoeGeo, mat.shoe, -0.16, -0.75, 0.06),
      mesh(shoeGeo, mat.shoe, 0.16, -0.75, 0.06),
    );

    // Shirt body, apron with straps, pocket with a measuring tape.
    const chest = mesh(
      g(new THREE.CapsuleGeometry(0.36, 0.28, 8, 20)),
      mat.shirt,
      0,
      -0.06,
      0,
    );
    chest.scale.set(1, 1, 0.82);
    torso.add(chest);
    const apron = mesh(
      g(new RoundedBoxGeometry(0.6, 0.5, 0.06, 4, 0.05)),
      mat.apron,
      0,
      -0.16,
      0.27,
    );
    apron.rotation.x = -0.08;
    torso.add(apron);
    const strapGeo = g(new RoundedBoxGeometry(0.06, 0.3, 0.04, 2, 0.015));
    const strapL = mesh(strapGeo, mat.apron, -0.17, 0.18, 0.25);
    const strapR = mesh(strapGeo, mat.apron, 0.17, 0.18, 0.25);
    strapL.rotation.set(-0.35, 0, -0.15);
    strapR.rotation.set(-0.35, 0, 0.15);
    torso.add(strapL, strapR);
    torso.add(
      mesh(
        g(new RoundedBoxGeometry(0.24, 0.16, 0.04, 2, 0.02)),
        mat.apronDark,
        0,
        -0.24,
        0.31,
      ),
    );
    const tape = mesh(
      g(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 24)),
      mat.tape,
      0.07,
      -0.2,
      0.34,
    );
    tape.rotation.x = Math.PI / 2;
    torso.add(tape);
    torso.add(
      mesh(
        g(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 16)),
        mat.skinShade,
        0,
        0.3,
        0,
      ),
    ); // neck

    // Arms on shoulder pivots: sleeve and hand.
    const sleeveGeo = g(new THREE.CapsuleGeometry(0.095, 0.22, 6, 12));
    const handGeo = g(new THREE.SphereGeometry(0.1, 20, 14));
    const makeArm = (side: 1 | -1) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.4 * side, 0.16, 0);
      const sleeve = mesh(sleeveGeo, mat.shirt, 0.07 * side, -0.2, 0);
      sleeve.rotation.z = 0.3 * side;
      const hand = mesh(handGeo, mat.skin, 0.14 * side, -0.44, 0.02);
      pivot.add(sleeve, hand);
      root.add(pivot);
      return pivot;
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);

    // Head (turns to look at you).
    const body = new THREE.Group();
    body.position.y = 0.8;
    root.add(body);
    const skull = mesh(g(new THREE.SphereGeometry(0.62, 40, 30)), mat.skin);
    skull.scale.set(1, 0.95, 0.92);
    body.add(skull);
    const earGeo = g(new THREE.SphereGeometry(0.13, 20, 14));
    for (const sx of [-1, 1]) {
      const ear = mesh(earGeo, mat.skin, 0.6 * sx, 0, 0);
      ear.scale.set(0.6, 1, 0.7);
      body.add(ear);
    }
    // Hair: a cap with a wavy fringe, side locks, and a top-knot with a brass tie (it glows with Zuki's mood).
    const cap = mesh(
      g(
        new THREE.SphereGeometry(
          0.655,
          40,
          24,
          0,
          Math.PI * 2,
          0,
          Math.PI * 0.485,
        ),
      ),
      mat.hair,
      0,
      0.02,
      -0.02,
    );
    cap.rotation.x = -0.28;
    cap.scale.set(1.02, 1, 0.98);
    body.add(cap);
    const tuftGeo = g(new THREE.SphereGeometry(0.16, 16, 12));
    for (const [x, y, z, sx] of [
      [-0.3, 0.42, 0.42, 1.2],
      [0.05, 0.47, 0.45, 1.3],
      [0.36, 0.38, 0.4, 1.0],
      [-0.56, 0.05, 0.12, 0.9],
      [0.56, 0.05, 0.12, 0.9],
    ] as const) {
      const t = mesh(tuftGeo, mat.hair, x, y, z);
      t.scale.set(sx, 0.6, 0.55);
      body.add(t);
    }
    body.add(
      mesh(
        g(new THREE.SphereGeometry(0.21, 24, 18)),
        mat.hair,
        0.04,
        0.68,
        -0.08,
      ),
    );
    const tie = mesh(
      g(new THREE.TorusGeometry(0.13, 0.045, 10, 24)),
      mat.lamp,
      0.03,
      0.55,
      -0.06,
    );
    tie.rotation.x = Math.PI / 2 - 0.2;
    body.add(tie);
    // Pencil tucked behind the right ear.
    const pencil = new THREE.Group();
    pencil.add(
      mesh(g(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6)), mat.pencil),
    );
    pencil.add(
      mesh(
        g(new THREE.CylinderGeometry(0.036, 0.036, 0.06, 6)),
        mat.eraser,
        0,
        0.24,
        0,
      ),
    );
    const tip = mesh(
      g(new THREE.ConeGeometry(0.035, 0.09, 6)),
      mat.wood,
      0,
      -0.255,
      0,
    );
    tip.rotation.x = Math.PI;
    pencil.add(tip);
    pencil.position.set(0.62, 0.22, 0.05);
    pencil.rotation.set(0.2, 0, -0.55);
    body.add(pencil);

    // Face.
    const faceZ = 0.53;
    const scleraGeo = g(new THREE.SphereGeometry(0.135, 24, 18));
    const irisGeo = g(new THREE.SphereGeometry(0.085, 20, 14));
    const pupilGeo = g(new THREE.SphereGeometry(0.046, 16, 12));
    const glintGeo = g(new THREE.SphereGeometry(0.024, 12, 8));
    const irises: THREE.Group[] = [];
    const makeEye = (x: number) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0.02, faceZ);
      const sclera = mesh(scleraGeo, mat.sclera);
      sclera.scale.set(1, 1.15, 0.45);
      const iris = new THREE.Group();
      const ir = mesh(irisGeo, mat.iris, 0, -0.01, 0.045);
      ir.scale.set(1, 1, 0.35);
      const pu = mesh(pupilGeo, mat.eye, 0, -0.01, 0.07);
      pu.scale.set(1, 1, 0.35);
      const gl = mesh(glintGeo, mat.white, 0.03, 0.035, 0.085);
      iris.add(ir, pu, gl);
      grp.add(sclera, iris);
      irises.push(iris);
      body.add(grp);
      return grp;
    };
    const eyeL = makeEye(-0.21);
    const eyeR = makeEye(0.21);

    // Happy eyes: little arcs (^ ^).
    const arcGeo = g(new THREE.TorusGeometry(0.085, 0.022, 8, 20, Math.PI));
    const happyL = mesh(arcGeo, mat.eye, -0.21, 0.0, faceZ + 0.05);
    const happyR = mesh(arcGeo, mat.eye, 0.21, 0.0, faceZ + 0.05);
    body.add(happyL, happyR);

    // Brows: relaxed, or raised in the middle when worried.
    const browGeo = g(new THREE.CapsuleGeometry(0.022, 0.13, 4, 8));
    const browL = mesh(browGeo, mat.hair, -0.21, 0.19, faceZ + 0.05);
    const browR = mesh(browGeo, mat.hair, 0.21, 0.19, faceZ + 0.05);
    body.add(browL, browR);

    // Nose, mouth (smile / talking / frown) and cheeks.
    body.add(
      mesh(
        g(new THREE.SphereGeometry(0.05, 16, 12)),
        mat.skinShade,
        0,
        -0.1,
        faceZ + 0.06,
      ),
    );
    const smile = mesh(
      g(new THREE.TorusGeometry(0.11, 0.022, 8, 24, Math.PI)),
      mat.mouth,
      0,
      -0.2,
      faceZ + 0.02,
    );
    smile.rotation.z = Math.PI;
    body.add(smile);
    const open = mesh(
      g(new THREE.SphereGeometry(0.09, 24, 16)),
      mat.mouth,
      0,
      -0.27,
      faceZ - 0.01,
    );
    body.add(open);
    const frown = mesh(
      g(new THREE.TorusGeometry(0.085, 0.02, 8, 20, Math.PI)),
      mat.mouth,
      0,
      -0.32,
      faceZ + 0.01,
    );
    body.add(frown);
    const cheekGeo = g(new THREE.CircleGeometry(0.075, 24));
    const cheekL = mesh(cheekGeo, mat.cheek, -0.34, -0.14, faceZ - 0.02);
    const cheekR = mesh(cheekGeo, mat.cheek, 0.34, -0.14, faceZ - 0.02);
    cheekL.rotation.y = -0.45;
    cheekR.rotation.y = 0.45;
    body.add(cheekL, cheekR);

    // Listening rings and thinking dots.
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(
        g(new THREE.TorusGeometry(0.85, 0.02, 8, 64)),
        mat.ring.clone(),
      );
      r.position.set(0, 0.8, -0.25);
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
      g(new THREE.PlaneGeometry(1.8, 0.6)),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.83;
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
      body.rotation.y = look.x * 0.6;
      body.rotation.x = look.y * 0.3;
      torso.rotation.y = look.x * 0.15;
      shadow.scale.setScalar(1 - bob * 0.8);

      // Eyes: follow, blink, widen when listening.
      if (now > nextBlink) {
        blinkUntil = now + 140;
        nextBlink = now + 2200 + Math.random() * 3200;
      }
      const blink = now < blinkUntil ? 0.1 : 1;
      const wide = st === "listening" ? 1.15 : st === "concerned" ? 0.92 : 1;
      const happy = st === "happy";
      for (const eye of [eyeL, eyeR]) {
        eye.visible = !happy;
        eye.scale.set(wide, wide * blink, 1);
      }
      // Irises follow where Zuki is looking.
      for (const iris of irises)
        iris.position.set(look.x * 0.045, -look.y * 0.04, 0);
      happyL.visible = happyR.visible = happy;
      // Brows lift in the middle when worried, rise a little when listening.
      const worried = st === "concerned";
      browL.rotation.z = Math.PI / 2 + (worried ? 0.4 : -0.08);
      browR.rotation.z = Math.PI / 2 - (worried ? 0.4 : -0.08);
      browL.position.y = browR.position.y =
        0.19 + (st === "listening" ? 0.03 : worried ? 0.02 : 0);

      // Mouth: talk with the voice, smile otherwise, frown when worried.
      const m = st === "speaking" ? mouthLevel(now) : 0;
      open.visible = st === "speaking" || st === "listening";
      if (st === "listening") open.scale.set(0.55, 0.5, 0.4);
      else open.scale.set(0.9 + m * 0.3, 0.15 + m * 0.85, 0.4);
      smile.visible = !open.visible && st !== "concerned";
      smile.scale.setScalar(happy ? 1.35 : 1);
      frown.visible = st === "concerned";
      mat.cheek.opacity = happy ? 0.75 : 0.45;

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
            ? 2.5
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
          1.72 + Math.sin(t * 4 + i) * 0.05,
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
