"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ZukiFigure, ZukiHeadParts } from "./zuki-art";

const Zuki3D = dynamic(() => import("./zuki-3d"), { ssr: false });

/** 3D needs WebGL; people who asked their phone for less motion get the flat drawing. */
function can3D() {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return false;
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Zuki — the Voice Desk assistant. An original character: a little brass "house" with a lamp antenna.
 * States: idle (floats and blinks), speaking (mouth moves), listening (sound waves, wide eyes), thinking (looks up, dots).
 */
/** Just Zuki's face, for the floating button. */
export function ZukiFace({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="40 14 120 120" width={size} height={size} aria-hidden="true">
      <ZukiHeadParts />
    </svg>
  );
}

export type ZukiState =
  "idle" | "speaking" | "listening" | "thinking" | "happy" | "concerned";

export function Zuki({
  state,
  bubble,
  userText,
  hint,
  onTap,
  disabled,
  size = 168,
}: {
  state: ZukiState;
  bubble: string;
  userText?: string;
  hint: string;
  onTap: () => void;
  disabled?: boolean;
  size?: number;
}) {
  const [three, setThree] = useState<"off" | "loading" | "ready">("off");
  useEffect(() => {
    if (can3D()) setThree("loading");
  }, []);
  return (
    <div className="flex flex-col items-center">
      <style>{CSS}</style>
      {/* Speech bubble */}
      <div
        key={bubble}
        className={`zk-bubble relative mb-3 w-full max-w-sm whitespace-pre-line rounded-2xl border border-line bg-paper px-4 py-3 leading-snug shadow-sm ${bubble.length > 140 ? "text-left text-sm" : "text-center text-[15px]"}`}
      >
        {state === "thinking" ? (
          <span className="inline-flex gap-1 py-1" aria-label="Thinking">
            <span className="zk-dot" />
            <span className="zk-dot" style={{ animationDelay: "0.15s" }} />
            <span className="zk-dot" style={{ animationDelay: "0.3s" }} />
          </span>
        ) : (
          bubble
        )}
        <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-line bg-paper" />
      </div>

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={three === "ready" || disabled ? undefined : onTap}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onTap();
          }
        }}
        aria-label={
          state === "listening" ? "Stop listening" : "Tap Zuki to speak"
        }
        className={`zk zk-${state} relative grid select-none place-items-center rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-brass ${disabled ? "opacity-60" : ""}`}
        style={{ width: Math.round(size * 1.25), height: size }}
      >
        {three !== "off" && (
          <div className="absolute inset-0">
            <Zuki3D
              state={state}
              size={size}
              onTap={onTap}
              disabled={disabled}
              onReady={() => setThree("ready")}
              onFail={() => setThree("off")}
            />
          </div>
        )}
        <div
          className="pointer-events-none transition-opacity duration-300"
          style={{ opacity: three === "ready" ? 0 : 1 }}
        >
          <svg
            viewBox="0 0 200 200"
            width={size}
            height={size}
            aria-hidden="true"
          >
            <ZukiFigure />
          </svg>
        </div>
      </div>

      {userText && (
        <p className="zk-heard mt-1 max-w-sm rounded-2xl bg-ink px-3 py-1.5 text-center text-sm text-paper">
          {userText}
        </p>
      )}
      <p className="mt-2 text-xs font-semibold text-muted">{hint}</p>
    </div>
  );
}

const CSS = `
.zk { -webkit-tap-highlight-color: transparent; cursor: pointer; }
.zk:active svg { transform: scale(0.96); }
.zk svg { transition: transform .15s; overflow: visible; }
.zk-body, .zk-arm-l, .zk-arm-r { transform-box: view-box; }
.zk-shadow { transform-box: fill-box; transform-origin: center; animation: zk-shadow 3.2s ease-in-out infinite; }
.zk-body { transform-origin: 100px 186px; animation: zk-float 3.2s ease-in-out infinite; }
.zk-eye { transform-box: fill-box; transform-origin: center; animation: zk-blink 4.5s infinite; }
.zk-mouth { opacity: 0; transform-box: fill-box; transform-origin: center; }
.zk-smile { transition: opacity .15s; }
.zk-waves { opacity: 0; transition: opacity .2s; }
.zk-lamp { transition: fill .2s; }
.zk-eyes { transition: transform .3s; }

/* Speaking */
.zk-speaking .zk-smile { opacity: 0; }
.zk-speaking .zk-mouth { opacity: 1; animation: zk-talk .28s ease-in-out infinite alternate; }
.zk-speaking .zk-body { animation: zk-bob .55s ease-in-out infinite alternate; }
.zk-speaking .zk-arm-r { transform-origin: 123px 134px; animation: zk-wave 0.9s ease-in-out infinite alternate; }

/* Listening */
.zk-listening .zk-waves { opacity: 1; }
.zk-listening .zk-w1 { animation: zk-pulse 1s ease-in-out infinite; }
.zk-listening .zk-w2 { animation: zk-pulse 1s ease-in-out .25s infinite; }
.zk-listening .zk-eye { animation: none; transform: scale(1.12); }
.zk-listening .zk-smile { opacity: 0; }
.zk-listening .zk-mouth { opacity: 1; transform: scale(.55, .7); }
.zk-listening .zk-lamp { fill: var(--color-clay); animation: zk-glow 1s ease-in-out infinite; }
.zk-listening .zk-body { animation: zk-lean 1.6s ease-in-out infinite alternate; }
.zk-listening .zk-arm-r { transform-origin: 123px 134px; transform: rotate(-125deg); transition: transform .3s; }

/* Happy and concerned */
.zk-happy-eyes, .zk-brows, .zk-frown { opacity: 0; transition: opacity .2s; }
.zk-happy .zk-eye { opacity: 0; }
.zk-happy .zk-happy-eyes { opacity: 1; }
.zk-happy .zk-smile { transform-box: fill-box; transform-origin: center; transform: scale(1.35, 1.6); }
.zk-happy .zk-body { animation: zk-hop .5s cubic-bezier(.3,1.6,.5,1) 2; }
.zk-happy .zk-arm-l { transform-origin: 77px 134px; animation: zk-cheer .5s ease-in-out 2 alternate; }
.zk-happy .zk-arm-r { transform-origin: 123px 134px; animation: zk-cheer-r .5s ease-in-out 2 alternate; }
.zk-happy .zk-lamp { fill: #e8c46a; }
.zk-concerned .zk-brows, .zk-concerned .zk-frown { opacity: 1; }
.zk-concerned .zk-brows-n { opacity: 0; }
.zk-concerned .zk-smile { opacity: 0; }
.zk-concerned .zk-eye { animation: none; transform: scale(.9); }
.zk-concerned .zk-body { animation: zk-tilt 1.8s ease-in-out infinite alternate; }
.zk-concerned .zk-lamp { fill: var(--color-clay); }

/* Thinking */
.zk-thinking .zk-eyes { transform: translate(5px, -6px); }
.zk-thinking .zk-eye { animation: none; }
.zk-thinking .zk-lamp { fill: var(--color-olive); animation: zk-glow .8s ease-in-out infinite; }
.zk-thinking .zk-body { animation: zk-float 1.4s ease-in-out infinite; }

.zk-bubble { animation: zk-pop .25s ease-out; }
.zk-heard { animation: zk-pop .2s ease-out; }
.zk-dot { width: 8px; height: 8px; border-radius: 9999px; background: var(--color-muted); animation: zk-dots .9s ease-in-out infinite; }

@keyframes zk-hop { 0%,100% { transform: translateY(0) } 40% { transform: translateY(-12px) } }
@keyframes zk-cheer { to { transform: rotate(40deg) } }
@keyframes zk-cheer-r { to { transform: rotate(-40deg) } }
@keyframes zk-tilt { from { transform: rotate(-4deg) } to { transform: rotate(2deg) } }
@keyframes zk-shadow { 0%,100% { transform: scaleX(1); opacity: .12 } 50% { transform: scaleX(.85); opacity: .08 } }
@keyframes zk-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes zk-bob { from { transform: translateY(0) rotate(-1.5deg) } to { transform: translateY(-3px) rotate(1.5deg) } }
@keyframes zk-lean { from { transform: rotate(-3deg) } to { transform: rotate(3deg) } }
@keyframes zk-blink { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
@keyframes zk-talk { from { transform: scaleY(.35) } to { transform: scaleY(1.15) } }
@keyframes zk-wave { from { transform: rotate(0deg) } to { transform: rotate(-28deg) } }
@keyframes zk-pulse { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
@keyframes zk-glow { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
@keyframes zk-pop { from { transform: scale(.94); opacity: 0 } to { transform: scale(1); opacity: 1 } }
@keyframes zk-dots { 0%,100% { transform: translateY(0); opacity: .4 } 50% { transform: translateY(-4px); opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .zk *, .zk-bubble { animation: none !important; } }
`;
