/** A living room drawn in a single brass line that sketches itself in, then the lamp switches on. */
export function RoomSketch({ className = "" }: { className?: string }) {
  // Each stroke draws in turn; `d` is its delay in seconds.
  const lines: { path: string; d: number; len?: number }[] = [
    { path: "M10 222 H350", d: 0 }, // floor
    {
      path: "M120 40 v120 M120 40 a40 40 0 0 1 80 0 v120 h-80 M160 0 v0",
      d: 0.25,
    }, // arched window
    { path: "M160 40 v120 M120 100 h80", d: 0.55, len: 260 }, // window bars
    {
      path: "M40 222 v-38 a10 10 0 0 1 10 -10 h130 a10 10 0 0 1 10 10 v38",
      d: 0.7,
    }, // sofa back
    {
      path: "M30 222 v-28 a8 8 0 0 1 16 0 v12 h130 v-12 a8 8 0 0 1 16 0 v28",
      d: 0.95,
    }, // sofa arms + seat
    { path: "M60 206 h50 M120 206 h50", d: 1.15, len: 120 }, // cushions
    { path: "M60 222 h-4 M174 222 h4", d: 1.2, len: 30 },
    { path: "M262 222 v-130 M244 92 h36 l-8 -26 h-20 z", d: 1.1 }, // floor lamp
    { path: "M250 222 h24", d: 1.35, len: 40 },
    {
      path: "M300 222 c-6 -16 -2 -30 8 -30 c10 0 14 14 8 30 z M308 192 c-4 -18 -16 -26 -24 -28 M308 192 c2 -16 12 -26 22 -30 M308 192 c0 -14 -4 -26 -10 -34",
      d: 1.3,
    }, // plant
    { path: "M226 140 h30 v26 h-30 z", d: 1.45, len: 120 }, // little side table frame (on wall)
  ];
  return (
    <svg viewBox="0 0 360 240" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="zk-lamp-glow" cx="50%" cy="0%" r="70%">
          <stop offset="0%" stopColor="#f3d9a6" stopOpacity=".95" />
          <stop offset="100%" stopColor="#f3d9a6" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Light pooling from the lamp, after the drawing finishes */}
      <path
        d="M248 94 L210 222 H318 L276 94 Z"
        fill="url(#zk-lamp-glow)"
        style={{
          opacity: 0,
          animation: "zk-lamp-on .9s ease-out 2.1s forwards",
        }}
      />
      <rect
        x="120"
        y="40"
        width="80"
        height="120"
        rx="0"
        fill="#f6ead8"
        style={{
          opacity: 0,
          animation: "zk-lamp-on 1s ease-out 1.6s forwards",
        }}
        clipPath="url(#zk-arch)"
      />
      <clipPath id="zk-arch">
        <path d="M120 160 V80 a40 40 0 0 1 80 0 V160 Z" />
      </clipPath>
      <g
        fill="none"
        stroke="var(--color-brass)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {lines.map((l, i) => (
          <path
            key={i}
            d={l.path}
            strokeDasharray={l.len ?? 600}
            strokeDashoffset={l.len ?? 600}
            style={{
              animation: `zk-draw 1.1s cubic-bezier(.6,.1,.3,1) ${l.d}s forwards`,
            }}
          />
        ))}
      </g>
      <circle
        cx="262"
        cy="98"
        r="3"
        fill="var(--color-brass)"
        style={{ opacity: 0, animation: "zk-lamp-on .4s ease-out 2s forwards" }}
      />
      <style>{`@keyframes zk-lamp-on { to { opacity: 1 } }`}</style>
    </svg>
  );
}
