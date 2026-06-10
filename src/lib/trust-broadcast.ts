/**
 * Notify the Socket.io server that a seller's trust score has changed,
 * so open chat windows can refresh the badge live.
 *
 * Fail-gracefully: a failure here never blocks the main business logic.
 * The caller in trust-score.ts wraps this in try/catch + Sentry.
 */
export async function broadcastTrustUpdate(
  sellerId: string,
  trustScore: number,
  sellerLevel: string,
): Promise<void> {
  const url = process.env.SOCKET_INTERNAL_URL;
  if (!url) return; // not configured in local dev — silent no-op

  const secret = process.env.INTERNAL_API_SECRET;
  const res = await fetch(`${url}/internal/trust-updated`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret ?? ""}`,
    },
    body: JSON.stringify({ sellerId, trustScore, sellerLevel }),
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) {
    throw new Error(
      `[trust-broadcast] ${res.status} ${await res.text().catch(() => "")}`,
    );
  }
}
