"use client";

import { useEffect, useState } from "react";

/** Fills from empty on first view, with a soft sheen running across while it's not complete. */
export function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(v));
    return () => cancelAnimationFrame(id);
  }, [v]);
  const tone =
    v >= 100
      ? "var(--color-olive)"
      : v >= 60
        ? "linear-gradient(90deg, #6f8a5f, var(--color-olive))"
        : "linear-gradient(90deg, #c69a62, var(--color-brass))";
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-line/70"
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="relative h-full overflow-hidden rounded-full"
        style={{
          width: `${w}%`,
          background: tone,
          transition: "width 1s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {v > 0 && v < 100 && (
          <span
            className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            style={{ animation: "zk-sheen 2.4s ease-in-out 1s infinite" }}
          />
        )}
      </div>
    </div>
  );
}
