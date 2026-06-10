/**
 * Push a notification to the realtime socket server (Step 22).
 *
 * Direction: the Next.js app ORIGINATES notification events and pushes them to the
 * Socket.io server (the inverse of the Step 11 chat flow, where the socket server
 * calls the app). The socket server's authenticated `POST /notify` endpoint emits
 * `notification:new` to the recipient's private `user:<id>` room.
 *
 * Fail-OPEN for the caller: a down / unconfigured socket server must NEVER break the
 * in-app notification write or the user-facing mutation that triggered it. Every error
 * is swallowed here.
 */

export type SocketNotificationPayload = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string; // ISO
};

export async function pushNotificationToSocket(
  userId: string,
  notification: SocketNotificationPayload,
): Promise<void> {
  const url = process.env.SOCKET_INTERNAL_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  // Not configured (e.g. local dev without the socket server) → no-op silently.
  if (!url || !secret) return;

  try {
    await fetch(`${url.replace(/\/$/, "")}/notify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ userId, notification }),
      // Never let a hung socket server stall the caller.
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Socket server down / unreachable — realtime push is best-effort. The row is
    // already persisted; the bell will show it on next fetch.
  }
}
