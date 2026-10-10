"use client";

import { useEffect, useRef, useState } from "react";

/** Counts a number up from zero when it first appears. Leaves anything it can't safely re-format untouched. */
export function CountUp({ value }: { value: React.ReactNode }) {
  const text =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value
        : null;
  const m = text?.match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
  const plan = (() => {
    if (!m) return null;
    const raw = m[2];
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n === 0) return null;
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    const locale = /\d,\d\d,\d{3}/.test(raw) ? "en-IN" : "en-US";
    const grouped = raw.includes(",");
    const fmt = (x: number) =>
      x.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouped || undefined,
      });
    if (fmt(n) !== raw) return null;
    return { pre: m[1], post: m[3], n, fmt, decimals };
  })();
  const [shown, setShown] = useState(plan ? plan.fmt(0) : null);
  const done = useRef(false);
  useEffect(() => {
    if (!plan || done.current) return;
    done.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return setShown(plan.fmt(plan.n));
    const start = performance.now();
    const dur = Math.min(1100, 500 + plan.n.toString().length * 60);
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(
        plan.fmt(
          p === 1
            ? plan.n
            : plan.decimals
              ? plan.n * eased
              : Math.round(plan.n * eased),
        ),
      );
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!plan) return <>{value}</>;
  return (
    <span className="tabular-nums">
      {plan.pre}
      {shown}
      {plan.post}
    </span>
  );
}
