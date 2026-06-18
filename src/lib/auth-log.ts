import { createHash } from "crypto";

/**
 * Structured [AUTH] telemetry — one JSON line per authentication lifecycle event
 * so login / signup / OAuth / logout / session flows are observable in
 * production (Vercel ships stdout to its log drain; Railway likewise).
 *
 * PII-safe by construction: NEVER log a raw email or password. Emails are
 * hashed to a short, non-reversible token so events for one account can be
 * correlated without storing the address. The `evt` is always prefixed
 * `[AUTH] ` so the whole auth trail is greppable in one filter.
 *
 * This is operational logging, not the audit trail — security-relevant
 * mutations (ban, role change, dispute resolve) still write AuditLog rows.
 */

export type AuthEvent =
  | "signup.started"
  | "signup.success"
  | "signup.fail"
  | "login.started"
  | "login.success"
  | "login.fail"
  | "oauth.started"
  | "oauth.callback"
  | "oauth.denied"
  | "logout.success"
  | "session.created"
  | "session.revoked"
  | "email.verify.success"
  | "email.verify.fail"
  | "password.forgot"
  | "password.reset"
  | "seller.onboarded";

export type AuthLogContext = {
  userId?: string | null;
  /** Raw email — hashed before it leaves this function, never logged verbatim. */
  email?: string | null;
  provider?: string;
  ip?: string;
  reason?: string;
};

/** Short, stable, non-reversible fingerprint of an email (for correlation only). */
export function hashEmail(email?: string | null): string | undefined {
  if (!email) return undefined;
  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
}

/**
 * Emit one structured auth event. `.fail`/`.denied` events go to stderr
 * (console.warn) so they surface in error dashboards; everything else to stdout.
 */
export function authLog(evt: AuthEvent, ctx: AuthLogContext = {}): void {
  const { email, userId, ...rest } = ctx;
  const payload: Record<string, string | undefined> = {
    evt: `[AUTH] ${evt}`,
    ...(userId ? { userId } : {}),
    ...rest,
    ...(email ? { emailHash: hashEmail(email) } : {}),
  };
  const line = JSON.stringify(payload);
  if (evt.endsWith(".fail") || evt.endsWith(".denied")) console.warn(line);
  else console.log(line);
}
