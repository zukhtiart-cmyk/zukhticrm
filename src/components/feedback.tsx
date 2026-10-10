"use client";

/** Small, shared moments of feedback: saved, problem, working. */

const SWATCHES = [
  "#9a7140",
  "#4f6b4a",
  "#b4553a",
  "#3d5a78",
  "#d9b98c",
  "#1f1c18",
];

/** A brass check that draws itself, with a small burst of material-swatch colours. */
export function SavedCheck({
  size = 22,
  burst = true,
}: {
  size?: number;
  burst?: boolean;
}) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {burst &&
        SWATCHES.concat(SWATCHES).map((c, i) => {
          const a = (i / 12) * Math.PI * 2;
          const d = size * (1.1 + (i % 3) * 0.35);
          return (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] h-1.5 w-1.5"
              style={
                {
                  background: c,
                  borderRadius: i % 3 === 0 ? "9999px" : "1px",
                  "--dx": `${Math.cos(a) * d}px`,
                  "--dy": `${Math.sin(a) * d}px`,
                  "--r": `${i * 47}deg`,
                  animation: `zk-burst .7s cubic-bezier(.2,.8,.2,1) ${0.15 + (i % 4) * 0.03}s both`,
                } as React.CSSProperties
              }
            />
          );
        })}
      <svg viewBox="0 0 24 24" width={size} height={size} className="zk-pop">
        <circle cx="12" cy="12" r="11" fill="var(--color-olive)" />
        <path
          d="M7 12.5l3.2 3.2L17 9"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="16"
          strokeDashoffset="16"
          style={{ animation: "zk-draw .35s ease-out .2s forwards" }}
        />
      </svg>
    </span>
  );
}

export function SuccessNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={`zk-pop flex items-center gap-2.5 rounded-xl border border-olive/20 bg-olive-soft px-3 py-2.5 text-sm font-medium text-olive ${className}`}
    >
      <SavedCheck />
      <span>{children}</span>
    </p>
  );
}

export function ErrorNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={`zk-shake flex items-start gap-2.5 rounded-xl border border-clay/20 bg-clay-soft px-3 py-2.5 text-sm text-clay ${className}`}
    >
      <span
        className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-clay text-xs font-bold text-white"
        aria-hidden="true"
      >
        !
      </span>
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="animate-spin"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
