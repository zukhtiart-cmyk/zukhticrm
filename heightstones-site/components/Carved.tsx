"use client";

import { useEffect, useRef, useState } from "react";
import { FINISHES, STONES } from "@/lib/data";
import { snapshotStone } from "@/lib/stone-gl";

// Display text with real (generated) stone showing through the letterforms.
export default function Carved({ text, stone = "indian-sandstone" }: { text: string; stone?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const s = STONES.find((x) => x.slug === stone) ?? STONES[0];
    const el = ref.current;
    if (!el) return;
    const w = Math.min(2400, Math.ceil(el.clientWidth / 64) * 64 || 1024);
    const h = Math.min(1200, Math.ceil(el.clientHeight / 64) * 64 || 256);
    setUrl(snapshotStone({ kind: s.kind, palette: s.palette, scale: 2.4, seed: 11, finish: FINISHES.honed }, w, h));
  }, [stone]);

  return (
    <span ref={ref} className={`carved ${url ? "is-ready" : ""}`} style={url ? { backgroundImage: `url(${url})` } : undefined}>
      {text}
    </span>
  );
}
