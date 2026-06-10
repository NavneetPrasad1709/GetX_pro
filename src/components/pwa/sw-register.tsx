"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (Step 24) — PRODUCTION ONLY so dev HMR / fast-refresh is never disrupted.
 * Rendered after body content in the root layout; the useEffect keeps it off the critical path.
 */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => console.log("[pwa] service worker registered", reg.scope))
      .catch((err) => console.error("[pwa] service worker registration failed", err));
  }, []);

  return null;
}
