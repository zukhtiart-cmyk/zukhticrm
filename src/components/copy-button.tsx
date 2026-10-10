"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy link",
}: {
  text: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="btn-ghost px-3 py-1.5 text-xs"
    >
      {done ? "Copied" : label}
    </button>
  );
}
