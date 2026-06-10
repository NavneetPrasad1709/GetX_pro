"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Attaches the signed-in user to Sentry error context (Step 31) for the authenticated areas.
 * Clears it on unmount (sign-out / leaving the dashboard). Client-side only — server Sentry doesn't
 * persist user context across serverless requests. Only id + email (no other PII).
 */
export function SentryUserSync({ userId, email }: { userId: string; email: string | null }) {
  useEffect(() => {
    Sentry.setUser({ id: userId, email: email ?? undefined });
    return () => Sentry.setUser(null);
  }, [userId, email]);
  return null;
}
