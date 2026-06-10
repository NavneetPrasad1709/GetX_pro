/**
 * Resend email client (Step 22).
 *
 * Lazy singleton that returns `null` when RESEND_API_KEY is not configured, so the
 * notification service can no-op email gracefully in dev / before the key is set
 * (in-app + socket notifications keep working). Mirrors the db.ts singleton guard so
 * Next.js dev HMR doesn't create a new client on every reload.
 */
import { Resend } from "resend";
import { siteConfig } from "@/config/site";

const globalForResend = globalThis as unknown as {
  resend?: Resend | null;
};

/** Returns the Resend client, or `null` when no API key is configured. */
export function getResend(): Resend | null {
  if (globalForResend.resend !== undefined) return globalForResend.resend;
  const key = process.env.RESEND_API_KEY;
  globalForResend.resend = key ? new Resend(key) : null;
  return globalForResend.resend;
}

/** The verified "from" address. Configured in site.ts (env-backed). */
export const RESEND_FROM_EMAIL = siteConfig.notifications.fromEmail;
