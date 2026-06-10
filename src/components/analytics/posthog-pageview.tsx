"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";

/** Manual SPA pageview tracking (Step 31) — App Router navigations don't reload the page. */
export function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;
    const qs = searchParams.toString();
    posthog.capture("$pageview", { $current_url: pathname + (qs ? `?${qs}` : "") });
  }, [pathname, searchParams, posthog]);

  return null;
}
