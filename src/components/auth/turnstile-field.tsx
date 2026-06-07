"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import type { Ref } from "react";

/**
 * Cloudflare Turnstile widget. Renders nothing when no site key is configured
 * (local dev with TURNSTILE_DEV_BYPASS=true) — the server side then decides
 * whether the missing token is acceptable (see src/lib/turnstile.ts).
 */

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function TurnstileField({
  onToken,
  ref,
}: {
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileInstance>;
}) {
  if (!siteKey) return null;

  return (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      onSuccess={onToken}
      onExpire={() => onToken(null)}
      onError={() => onToken(null)}
      options={{ theme: "dark", size: "flexible" }}
    />
  );
}
