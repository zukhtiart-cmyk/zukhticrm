"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AssistantPanel } from "./assistant-panel";
import { primeSpeech } from "@/lib/speech-client";

/**
 * Floating Zuki button: one place to tell the CRM anything, from any page.
 * Zuki's eyes follow your finger or mouse, it blinks, hops when you arrive, and once a session
 * it pops up today's most useful nudge ("3 expenses are waiting for your approval").
 * `place`: crm = above the phone bottom bar; desk = above the desk's sticky save buttons.
 */
export function AssistantFab({ place = "desk" }: { place?: "crm" | "desk" }) {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [eye, setEye] = useState({ x: 0, y: 0 });

  // Eyes follow the pointer.
  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = btn.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.max(1, Math.hypot(dx, dy));
        const k = Math.min(1, d / 220);
        setEye({ x: (dx / d) * 4 * k, y: (dy / d) * 3.5 * k });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Once per session: the top thing that needs attention, as a little speech bubble.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("zuki-nudged") === "1";
    } catch {}
    if (seen) return;
    const timer = setTimeout(() => {
      fetch("/api/assistant/greeting")
        .then((r) => (r.ok ? r.json() : null))
        .then((g: { nudges?: string[] } | null) => {
          const first = g?.nudges?.[0];
          if (!first) return;
          setNudge(first);
          try {
            sessionStorage.setItem("zuki-nudged", "1");
          } catch {}
        })
        .catch(() => {});
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  // The nudge tidies itself away after a while.
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), 9000);
    return () => clearTimeout(t);
  }, [nudge]);

  const openPanel = () => {
    primeSpeech();
    setNudge(null);
    setOpen(true);
  };
  const bottom = place === "crm" ? "bottom-24 lg:bottom-6" : "bottom-36";

  return (
    <>
      {!open && nudge && (
        <div
          className={`zk-nudge no-print fixed right-4 z-40 max-w-[15rem] ${place === "crm" ? "bottom-44 lg:bottom-26" : "bottom-56"}`}
          role="status"
        >
          <button
            onClick={openPanel}
            className="block rounded-2xl rounded-br-md border border-line bg-paper px-3.5 py-2.5 pr-8 text-left text-[13px] leading-snug text-ink shadow-xl"
          >
            {nudge}
            <span className="mt-1 block text-xs font-semibold text-brass">
              Ask Zuki
            </span>
          </button>
          <button
            onClick={() => setNudge(null)}
            aria-label="Dismiss"
            className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {!open && (
        <button
          ref={btn}
          onClick={openPanel}
          className={`zk-fab no-print fixed right-4 z-40 grid h-16 w-16 place-items-center rounded-full border-2 border-brass bg-paper shadow-xl ${bottom}`}
          aria-label="Ask Zuki"
          title="Ask Zuki — speak or type anything"
        >
          <span className="zk-fab-bob">
            <svg
              viewBox="40 0 120 172"
              width={42}
              height={60}
              aria-hidden="true"
              style={{ overflow: "visible" }}
            >
              <line
                x1="100"
                y1="38"
                x2="100"
                y2="20"
                stroke="var(--color-ink)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <circle
                className="zk-fab-lamp"
                cx="100"
                cy="15"
                r="8"
                fill="var(--color-brass)"
              />
              <path
                d="M44 78 L100 34 L156 78 Z"
                fill="var(--color-ink)"
                stroke="var(--color-ink)"
                strokeWidth="8"
                strokeLinejoin="round"
              />
              <rect
                x="48"
                y="66"
                width="104"
                height="104"
                rx="30"
                fill="var(--color-brass)"
              />
              <rect
                x="58"
                y="76"
                width="84"
                height="84"
                rx="24"
                fill="#f6ead8"
              />
              <circle cx="70" cy="132" r="7" fill="#e9b7a3" opacity="0.8" />
              <circle cx="130" cy="132" r="7" fill="#e9b7a3" opacity="0.8" />
              <g
                style={{
                  transform: `translate(${eye.x}px, ${eye.y}px)`,
                  transition: "transform .12s ease-out",
                }}
              >
                <g className="zk-fab-eye">
                  <ellipse
                    cx="82"
                    cy="112"
                    rx="7.5"
                    ry="9.5"
                    fill="var(--color-ink)"
                  />
                  <ellipse
                    cx="118"
                    cy="112"
                    rx="7.5"
                    ry="9.5"
                    fill="var(--color-ink)"
                  />
                  <circle cx="84.5" cy="108.5" r="2.4" fill="#fff" />
                  <circle cx="120.5" cy="108.5" r="2.4" fill="#fff" />
                </g>
              </g>
              <path
                d="M88 136 q12 10 24 0"
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          {nudge && (
            <span
              className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-paper bg-clay"
              aria-hidden="true"
            />
          )}
          <style>{`
.zk-fab { transition: transform .2s cubic-bezier(.3,1.5,.5,1), box-shadow .2s; animation: zkfab-in .7s cubic-bezier(.3,1.6,.5,1) backwards; -webkit-tap-highlight-color: transparent; }
.zk-fab:hover { transform: translateY(-3px) scale(1.06); box-shadow: 0 18px 30px -12px rgb(154 113 64 / .6); }
.zk-fab:active { transform: scale(.92); }
.zk-fab-bob { display: block; margin-top: 4px; animation: zkfab 3s ease-in-out infinite; }
.zk-fab-eye { transform-box: fill-box; transform-origin: center; animation: zkfab-blink 4.2s infinite; }
.zk-fab:hover .zk-fab-lamp { fill: #e8c46a; }
.zk-nudge { animation: zkfab-pop .45s cubic-bezier(.3,1.5,.5,1) both; }
@keyframes zkfab { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
@keyframes zkfab-blink { 0%,93%,100% { transform: scaleY(1) } 96% { transform: scaleY(.1) } }
@keyframes zkfab-in { 0% { transform: translateY(30px) scale(.6); opacity: 0 } 60% { transform: translateY(-8px) scale(1.05); opacity: 1 } 100% { transform: none } }
@keyframes zkfab-pop { from { transform: translateY(10px) scale(.9); opacity: 0 } to { transform: none; opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .zk-fab, .zk-fab-bob, .zk-fab-eye, .zk-nudge { animation: none } }
`}</style>
        </button>
      )}
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}
