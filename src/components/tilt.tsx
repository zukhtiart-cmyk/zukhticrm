"use client";

import { useRef } from "react";

/**
 * Leans a card gently toward the mouse, with a soft light that follows it — like turning a material
 * sample under a lamp. Mouse and trackpad only; on phones the card stays still.
 */
export function Tilt({
  children,
  className = "",
  max = 5,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fine = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div
      ref={ref}
      className={`tilt ${className}`}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || !fine()) return;
        const el = ref.current!;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        el.style.setProperty("--rx", `${(0.5 - y) * max}deg`);
        el.style.setProperty("--ry", `${(x - 0.5) * max}deg`);
        el.style.setProperty("--mx", `${x * 100}%`);
        el.style.setProperty("--my", `${y * 100}%`);
        el.dataset.on = "1";
      }}
      onPointerLeave={() => {
        const el = ref.current!;
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
        delete el.dataset.on;
      }}
    >
      {children}
    </div>
  );
}
