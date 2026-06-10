"use client";

import { useEffect, useRef } from "react";
import { recordGuideViewAction } from "@/server/actions/guides";

/** Records one view per logged-in user on mount (Step 27). Non-blocking; no-op for guests. */
export function GuideViewTracker({ guideId }: { guideId: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void recordGuideViewAction(guideId);
  }, [guideId]);
  return null;
}
