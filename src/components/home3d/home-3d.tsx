"use client";

import dynamic from "next/dynamic";
import type { HomeScene, InteriorStyle } from "@/lib/home-scene";

/** Loads the three.js viewer only in the browser. */
export const Home3D = dynamic(() => import("./viewer"), {
  ssr: false,
  loading: () => (
    <div className="grid place-items-center rounded-2xl border border-line bg-[#f3eee6]" style={{ height: "min(78vh, 760px)" }}>
      <span className="inline-flex items-center gap-2 text-sm text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brass border-t-transparent" />
        Building your home in 3D…
      </span>
    </div>
  ),
});
export type { HomeScene, InteriorStyle };
