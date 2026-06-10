"use client";

import { useEffect } from "react";

/**
 * Device-fingerprint beacon (Prompt 16). Computes a lightweight, dependency-free
 * device hash from stable browser signals and POSTs it to /api/fingerprint once
 * per mount. Fire-and-forget — never blocks render, swallows all errors. A
 * heavier FingerprintJS visitorId can replace `computeFingerprint` later without
 * touching the server.
 *
 * Privacy: only on authenticated users; the hash is opaque (see Privacy Policy).
 */

async function computeFingerprint(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() ?? "",
    // @ts-expect-error deviceMemory is non-standard but widely available
    navigator.deviceMemory?.toString() ?? "",
  ].join("|");

  const data = new TextEncoder().encode(parts);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 64);
}

export function FingerprintBeacon() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const fingerprint = await computeFingerprint();
        if (cancelled) return;
        await fetch("/api/fingerprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint }),
          keepalive: true,
        });
      } catch {
        // best-effort telemetry — ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
