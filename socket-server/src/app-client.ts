/**
 * Thin HTTP client to the GETX Next app's SECURED internal API (Step 11). This
 * is how the socket server persists/authorizes WITHOUT holding any business
 * logic or DB access — all rules + Prisma live in the app. Every call carries
 * the shared INTERNAL_API_SECRET as a Bearer token.
 */

export type PersistedMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  senderName: string | null;
  senderImage: string | null;
};

export type PersistResult = PersistedMessage | { error: string };

export function createAppClient(appUrl: string, internalSecret: string) {
  const base = appUrl.replace(/\/+$/, "");
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${internalSecret}`,
  };

  async function post(path: string, payload: unknown): Promise<Response | null> {
    try {
      return await fetch(`${base}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch {
      return null; // app unreachable — caller decides how to degrade
    }
  }

  /** Is this user allowed to join (and receive) this conversation's room? */
  async function authorizeJoin(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const res = await post("/api/internal/socket/authorize", { userId, conversationId });
    if (!res || !res.ok) return false;
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return data?.ok === true;
  }

  /** Persist a message; returns the saved row or an error code. */
  async function persistMessage(
    userId: string,
    conversationId: string,
    body: string,
  ): Promise<PersistResult> {
    const res = await post("/api/internal/socket/message", { userId, conversationId, body });
    if (!res) return { error: "app_unreachable" };
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; message?: PersistedMessage; error?: string }
      | null;
    if (!res.ok || !data?.ok || !data.message) {
      return { error: data?.error ?? "rejected" };
    }
    return data.message;
  }

  /** Mark the other party's messages read; best-effort. */
  async function markRead(userId: string, conversationId: string): Promise<void> {
    await post("/api/internal/socket/read", { userId, conversationId });
  }

  return { authorizeJoin, persistMessage, markRead };
}
