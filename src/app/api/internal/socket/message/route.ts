import * as Sentry from "@sentry/nextjs";
import { isInternalRequest } from "@/lib/internal-auth";
import { internalMessageSchema } from "@/lib/validators/chat";
import { ChatServiceError, persistMessage } from "@/server/services/chat";

/**
 * Internal: persist a chat message (Step 11). Called by the Socket.io server on
 * `message:send`. Re-validates the body + re-checks the sender is a member (the
 * authoritative rule) before writing, then returns the saved row so the socket
 * server can broadcast it. Server-to-server only (INTERNAL_API_SECRET).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!isInternalRequest(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const parsed = internalMessageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  try {
    const message = await persistMessage(
      parsed.data.userId,
      parsed.data.conversationId,
      parsed.data.body,
    );
    return Response.json({ ok: true, message });
  } catch (err) {
    if (err instanceof ChatServiceError) {
      return Response.json({ ok: false, error: err.message }, { status: 403 });
    }
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[internal/socket/message]", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
