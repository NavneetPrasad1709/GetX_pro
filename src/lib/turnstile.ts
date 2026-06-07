/**
 * Cloudflare Turnstile server-side verification (bot protection on signup/login).
 *
 * Default is ON (fail closed). The ONLY way to skip it is:
 *   - no TURNSTILE_SECRET_KEY set, AND
 *   - NODE_ENV !== "production", AND
 *   - TURNSTILE_DEV_BYPASS=true explicitly set in .env
 * In production a missing key blocks the action with a clear config error —
 * we never silently run a money marketplace without bot protection.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; error: string };

export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    const devBypass =
      process.env.NODE_ENV !== "production" &&
      process.env.TURNSTILE_DEV_BYPASS === "true";
    if (devBypass) {
      console.warn(
        "[turnstile] DEV BYPASS active — set NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY before launch.",
      );
      return { ok: true };
    }
    return {
      ok: false,
      error:
        "Bot verification is not configured. Set Turnstile keys (or TURNSTILE_DEV_BYPASS=true in local dev).",
    };
  }

  if (!token) {
    return { ok: false, error: "Bot verification failed. Please try again." };
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(ip && ip !== "unknown" ? { remoteip: ip } : {}),
      }),
    });
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) {
      return { ok: false, error: "Bot verification failed. Please try again." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[turnstile] siteverify request failed:", err);
    return {
      ok: false,
      error: "Could not reach bot verification. Please try again.",
    };
  }
}
