"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FINISHES, type FinishKey, type Stone } from "@/lib/data";
import { StoneRenderer } from "@/lib/stone-gl";

type Props = {
  stone: Stone;
  finish: FinishKey;
  seed?: number;
  scale?: number;
  className?: string;
  children?: ReactNode;
  label?: string;
};

// A full-bleed slab lit by a lamp that follows the pointer. When the pointer
// is away, the lamp drifts slowly across the surface on its own.
export default function LiveStone({ stone, finish, seed = 1, scale, className, children, label }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<StoneRenderer | null>(null);
  const kick = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = wrap.current, cv = canvas.current;
    if (!el || !cv) return;
    const r = StoneRenderer.create(cv);
    if (!r) {
      setFailed(true);
      return;
    }
    renderer.current = r;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = { x: 0.62, y: 0.6 };
    const target = { x: 0.62, y: 0.6 };
    let pointer = false;
    let visible = false;
    let raf = 0;
    const t0 = performance.now();

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      r.resize(Math.max(1, Math.round(el.clientWidth * dpr)), Math.max(1, Math.round(el.clientHeight * dpr)));
    };

    const frame = () => {
      raf = 0;
      if (!pointer && !reduce) {
        const t = (performance.now() - t0) / 1000;
        target.x = 0.5 + 0.34 * Math.cos(t * 0.23);
        target.y = 0.55 + 0.25 * Math.sin(t * 0.31);
      }
      const dx = target.x - light.x, dy = target.y - light.y;
      light.x += dx * 0.12;
      light.y += dy * 0.12;
      r.render(light.x, light.y, true);
      const settling = Math.abs(dx) + Math.abs(dy) > 0.0005;
      if (visible && (settling || (!pointer && !reduce))) raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    kick.current = start;

    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      pointer = true;
      target.x = (e.clientX - b.left) / b.width;
      target.y = 1 - (e.clientY - b.top) / b.height;
      start();
    };
    const leave = () => {
      pointer = false;
      start();
    };

    const ro = new ResizeObserver(() => {
      size();
      start();
    });
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    size();
    ro.observe(el);
    io.observe(el);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      r.destroy();
      renderer.current = null;
    };
  }, []);

  useEffect(() => {
    renderer.current?.setParams({
      kind: stone.kind,
      palette: stone.palette,
      scale: scale ?? stone.scale,
      seed,
      finish: FINISHES[finish],
    });
    kick.current();
  }, [stone, finish, seed, scale]);

  return (
    <div
      ref={wrap}
      className={`live-stone ${className ?? ""}`}
      style={failed ? { background: `radial-gradient(120% 90% at 30% 20%, ${stone.palette[0]}, ${stone.palette[1]})` } : undefined}
    >
      <canvas ref={canvas} role="img" aria-label={label ?? `${FINISHES[finish].name} ${stone.name.toLowerCase()} surface`} />
      {children}
    </div>
  );
}
