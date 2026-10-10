"use client";

import { useEffect, useState } from "react";

/** Shows "New version — tap to update" when a newer deploy is live than the one this page was loaded with. */
export function UpdateBanner({ version }: { version: string }) {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (version === "dev") return;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { v } = (await r.json()) as { v: string };
        if (v && v !== version) setStale(true);
      } catch {}
    };
    check();
    const t = setInterval(check, 60_000);
    const onShow = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [version]);
  if (!stale) return null;
  return (
    <button
      onClick={async () => {
        try {
          const regs =
            (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
          await Promise.all(regs.map((r) => r.update()));
          if (typeof caches !== "undefined")
            await caches.delete("zukhti-desk-v1");
        } catch {}
        location.reload();
      }}
      className="fixed inset-x-3 top-3 z-50 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-paper shadow-lg"
    >
      ✨ A new version is ready — tap to update
    </button>
  );
}
