"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FINISHES, type FinishKey, type Stone } from "@/lib/data";
import { snapshotStone } from "@/lib/stone-gl";

type Props = {
  stone: Stone;
  finish?: FinishKey;
  seed?: number;
  scale?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  as?: "div" | "span";
};

// A still render of a stone, baked once into an image when it nears the
// viewport. Falls back to the stone's base colour without WebGL.
export default function StoneSwatch({ stone, finish, seed = 3, scale, className, style, children, as = "div" }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const f = finish ?? stone.finishes[0];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    const paint = () => {
      if (done) return;
      done = true;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      // Round sizes so near-identical swatches share one cached render.
      const w = Math.max(64, Math.ceil((el.clientWidth * dpr) / 64) * 64);
      const h = Math.max(64, Math.ceil((el.clientHeight * dpr) / 64) * 64);
      setUrl(
        snapshotStone(
          { kind: stone.kind, palette: stone.palette, scale: scale ?? stone.scale, seed, finish: FINISHES[f] },
          Math.min(w, 2400),
          Math.min(h, 2400),
        ),
      );
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          paint();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stone, f, seed, scale]);

  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      className={`swatch ${url ? "is-ready" : ""} ${className ?? ""}`}
      style={{
        ...style,
        backgroundColor: stone.palette[0],
        backgroundImage: url ? `url(${url})` : undefined,
      }}
    >
      {children}
    </Tag>
  );
}
