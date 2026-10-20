"use client";

import { useEffect, useRef, useState } from "react";

// The page is read as a core sample: a rail on the left reports how deep
// you've "drilled" and which stratum you're in.
export default function DepthGauge() {
  const marker = useRef<HTMLDivElement>(null);
  const [depth, setDepth] = useState(0);
  const [layer, setLayer] = useState("Surface");

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (marker.current) marker.current.style.transform = `translateY(${p * 100}%)`;
      setDepth(Math.round(p * 120));
      const probe = window.innerHeight * 0.45;
      let name = "Surface";
      document.querySelectorAll<HTMLElement>("[data-stratum]").forEach((s) => {
        if (s.getBoundingClientRect().top <= probe) name = s.dataset.stratum ?? name;
      });
      setLayer(name);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  return (
    <div className="gauge" aria-hidden="true">
      <div className="gauge-track">
        <div ref={marker} className="gauge-marker">
          <span className="gauge-read">
            <b>−{String(depth).padStart(3, "0")} m</b>
            <em>{layer}</em>
          </span>
        </div>
      </div>
    </div>
  );
}
