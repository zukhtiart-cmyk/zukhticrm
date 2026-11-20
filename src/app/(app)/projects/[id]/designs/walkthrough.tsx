"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a walk-through builds, checks every 8 s and refreshes the page when it's done. */
export function WalkthroughWatcher({ designId }: { designId: string }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await fetch(`/api/designs/${designId}/world`, { cache: "no-store" });
        const j = (await r.json()) as { status: string };
        if (j.status !== "building") return router.refresh();
      } catch {}
      setTimeout(tick, 8000);
    };
    const t = setTimeout(tick, 5000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [designId, router]);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-brass border-t-transparent" />
      Building the 3D walk-through… (about a minute)
    </span>
  );
}
