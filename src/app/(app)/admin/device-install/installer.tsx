"use client";

import { createElement, useEffect, useState } from "react";

/** The ESP Web Tools install button, loaded from /esp-web-tools, pointing at the firmware the GitHub build publishes. */
export function Installer() {
  const [version, setVersion] = useState<string | null | undefined>(undefined);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "serial" in navigator);
    fetch("/zuki-device/manifest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { version?: string } | null) => setVersion(m?.version ?? null))
      .catch(() => setVersion(null));
    if (!document.querySelector("script[data-esp-web-tools]")) {
      const s = document.createElement("script");
      s.type = "module";
      s.src = "/esp-web-tools/install-button.js";
      s.dataset.espWebTools = "1";
      document.head.appendChild(s);
    }
  }, []);
  if (version === undefined) return <p className="text-sm text-muted">Checking for the latest Zuki version…</p>;
  if (version === null)
    return <p className="rounded-xl bg-brass-soft px-3 py-2 text-sm text-brass">The Zuki firmware hasn&apos;t been built yet. It builds automatically on GitHub — check back in a few minutes.</p>;
  if (!supported)
    return <p className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-clay">This browser can&apos;t install over USB. Open this page in Chrome or Edge on a computer.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {createElement(
        "esp-web-install-button",
        { manifest: "/zuki-device/manifest.json" },
        <button slot="activate" className="btn-brass">
          Install Zuki v{version}
        </button>,
      )}
      <span className="text-xs text-muted">Version {version}</span>
    </div>
  );
}
