"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

/**
 * Client PostHog provider (Step 31). Env-safe: with no NEXT_PUBLIC_POSTHOG_KEY it renders children
 * directly (no provider, no init) so there's zero overhead + zero errors when analytics is off.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  useEffect(() => {
    if (!key) return; // disabled — skip init entirely
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
      capture_pageview: false, // manual SPA pageview via <PostHogPageview/>
      capture_pageleave: true,
      autocapture: true,
      persistence: "localStorage",
      loaded(ph) {
        if (process.env.NODE_ENV === "development") ph.debug();
      },
    });
  }, [key]);

  if (!key) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
