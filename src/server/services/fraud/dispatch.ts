import * as Sentry from "@sentry/nextjs";

/**
 * Fire a fraud signal without ever blocking or crashing the main flow (Prompt 16).
 * Errors are logged + reported, never thrown. Use at every integration hook:
 *   fireFraudSignal("order_velocity", checkOrderVelocity(buyerId));
 */
export function fireFraudSignal(name: string, p: Promise<unknown>): void {
  void p.catch((e) => {
    console.error(`[fraud-signal] ${name} failed:`, e);
    Sentry.captureException(e, { tags: { signal: name } });
  });
}
