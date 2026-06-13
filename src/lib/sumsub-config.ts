/**
 * Sumsub KYC config (Step 29). Env-safe feature flag: with no app token + secret, SUMSUB_ENABLED is
 * false and the UI falls back to the Step 12 manual upload flow. The webhook + service read
 * `process.env` directly (not this snapshot) so they're always runtime-fresh.
 */

/** Module-load snapshot — used to gate the verify UI (env is static in production). */
export const SUMSUB_ENABLED = Boolean(
  process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY,
);

/** Runtime-fresh check (used by the service + webhook so QA/env changes are respected). */
export function isSumsubEnabled(): boolean {
  return Boolean(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY);
}

export function sumsubBaseUrl(): string {
  return process.env.SUMSUB_BASE_URL ?? "https://api.sumsub.com";
}

export const SUMSUB_LEVEL = "id-and-liveness";
