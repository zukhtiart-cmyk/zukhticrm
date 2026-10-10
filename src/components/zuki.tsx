"use client";

/**
 * Zuki — the Voice Desk assistant. An original character: a little brass "house" with a lamp antenna.
 * States: idle (floats and blinks), speaking (mouth moves), listening (sound waves, wide eyes), thinking (looks up, dots).
 */
/** Just Zuki's face, for the floating button. */
export function ZukiFace({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="40 30 120 140" width={size} height={size} aria-hidden="true">
      <line
        x1="100"
        y1="38"
        x2="100"
        y2="22"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="100" cy="17" r="8" fill="var(--color-brass)" />
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
      <rect x="58" y="76" width="84" height="84" rx="24" fill="#f6ead8" />
      <ellipse cx="82" cy="112" rx="7" ry="9" fill="var(--color-ink)" />
      <ellipse cx="118" cy="112" rx="7" ry="9" fill="var(--color-ink)" />
      <path
        d="M88 136 q12 10 24 0"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type ZukiState = "idle" | "speaking" | "listening" | "thinking";

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
  return (
    <div className="flex flex-col items-center">
      <style>{CSS}</style>
      {/* Speech bubble */}
      <div
        key={bubble}
        className="zk-bubble relative mb-3 w-full max-w-sm rounded-2xl border border-line bg-paper px-4 py-3 text-center text-[15px] leading-snug shadow-sm"
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

      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        aria-label={
          state === "listening" ? "Stop listening" : "Tap Zuki to speak"
        }
        className={`zk zk-${state} relative select-none outline-none disabled:opacity-60`}
      >
        <svg
          viewBox="0 0 200 200"
          width={size}
          height={size}
          aria-hidden="true"
        >
          {/* Listening waves */}
          <g
            className="zk-waves"
            fill="none"
            stroke="var(--color-olive)"
            strokeWidth="5"
            strokeLinecap="round"
          >
            <path className="zk-w1" d="M30 95 q-10 15 0 30" />
            <path className="zk-w2" d="M16 85 q-17 25 0 50" />
            <path className="zk-w1" d="M170 95 q10 15 0 30" />
            <path className="zk-w2" d="M184 85 q17 25 0 50" />
          </g>

          {/* Shadow stays on the ground while Zuki floats */}
          <ellipse
            className="zk-shadow"
            cx="100"
            cy="186"
            rx="44"
            ry="6"
            fill="#1f1c18"
            opacity="0.12"
          />
          <g className="zk-body">
            {/* Antenna lamp */}
            <line
              x1="100"
              y1="38"
              x2="100"
              y2="22"
              stroke="var(--color-ink)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle
              className="zk-lamp"
              cx="100"
              cy="17"
              r="8"
              fill="var(--color-brass)"
            />
            {/* Roof */}
            <path
              d="M44 78 L100 34 L156 78 Z"
              fill="var(--color-ink)"
              strokeLinejoin="round"
              stroke="var(--color-ink)"
              strokeWidth="8"
            />
            {/* Face / house */}
            <rect
              x="48"
              y="66"
              width="104"
              height="104"
              rx="30"
              fill="var(--color-brass)"
            />
            <rect x="58" y="76" width="84" height="84" rx="24" fill="#f6ead8" />
            {/* Cheeks */}
            <circle cx="72" cy="132" r="7" fill="#e9b7a3" opacity="0.8" />
            <circle cx="128" cy="132" r="7" fill="#e9b7a3" opacity="0.8" />
            {/* Eyes */}
            <g className="zk-eyes">
              <g className="zk-eye">
                <ellipse
                  cx="82"
                  cy="112"
                  rx="7"
                  ry="9"
                  fill="var(--color-ink)"
                />
                <circle
                  className="zk-glint"
                  cx="84.5"
                  cy="108.5"
                  r="2.3"
                  fill="#fff"
                />
              </g>
              <g className="zk-eye">
                <ellipse
                  cx="118"
                  cy="112"
                  rx="7"
                  ry="9"
                  fill="var(--color-ink)"
                />
                <circle
                  className="zk-glint"
                  cx="120.5"
                  cy="108.5"
                  r="2.3"
                  fill="#fff"
                />
              </g>
            </g>
            {/* Mouth: a smile when idle, opens when speaking, small "o" when listening */}
            <path
              className="zk-smile"
              d="M88 136 q12 10 24 0"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <ellipse
              className="zk-mouth"
              cx="100"
              cy="139"
              rx="9"
              ry="6"
              fill="var(--color-ink)"
            />
            {/* Little arms */}
            <path
              className="zk-arm-l"
              d="M48 128 q-14 4 -16 18"
              fill="none"
              stroke="var(--color-brass)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              className="zk-arm-r"
              d="M152 128 q14 4 16 18"
              fill="none"
              stroke="var(--color-brass)"
              strokeWidth="8"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </button>

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
.zk-body { transform-origin: 100px 180px; animation: zk-float 3.2s ease-in-out infinite; }
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
.zk-speaking .zk-arm-r { transform-origin: 152px 128px; animation: zk-wave 0.9s ease-in-out infinite alternate; }

/* Listening */
.zk-listening .zk-waves { opacity: 1; }
.zk-listening .zk-w1 { animation: zk-pulse 1s ease-in-out infinite; }
.zk-listening .zk-w2 { animation: zk-pulse 1s ease-in-out .25s infinite; }
.zk-listening .zk-eye { animation: none; transform: scale(1.12); }
.zk-listening .zk-smile { opacity: 0; }
.zk-listening .zk-mouth { opacity: 1; transform: scale(.55, .7); }
.zk-listening .zk-lamp { fill: var(--color-clay); animation: zk-glow 1s ease-in-out infinite; }
.zk-listening .zk-body { animation: zk-lean 1.6s ease-in-out infinite alternate; }

/* Thinking */
.zk-thinking .zk-eyes { transform: translate(5px, -6px); }
.zk-thinking .zk-eye { animation: none; }
.zk-thinking .zk-lamp { fill: var(--color-olive); animation: zk-glow .8s ease-in-out infinite; }
.zk-thinking .zk-body { animation: zk-float 1.4s ease-in-out infinite; }

.zk-bubble { animation: zk-pop .25s ease-out; }
.zk-heard { animation: zk-pop .2s ease-out; }
.zk-dot { width: 8px; height: 8px; border-radius: 9999px; background: var(--color-muted); animation: zk-dots .9s ease-in-out infinite; }

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
