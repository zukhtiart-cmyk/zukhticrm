"use client";

import { useEffect } from "react";

/** Registers the Voice Desk service worker so the desk opens with no signal. */
export function SwRegister() {
  useEffect(() => {
    if (
      "serviceWorker" in navigator &&
      (location.protocol === "https:" || location.hostname === "localhost")
    )
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/** On the login screens: forget the cached desk page so the next person on this phone can't see it. */
export function SwClear() {
  useEffect(() => {
    if (typeof caches !== "undefined")
      caches.delete("zukhti-desk-v1").catch(() => {});
  }, []);
  return null;
}
