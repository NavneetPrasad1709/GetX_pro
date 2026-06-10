import { isInternalRequest } from "@/lib/internal-auth";
import { internalReadSchema } from "@/lib/validators/chat";
import { ChatServiceError, markRead } from "@/server/services/chat";

/**
 * Internal: mark the other party's messages as read (Step 11). Called by the
 * Socket.io server on `message:read`. Server-to-server only (INTERNAL_API_SECRET).
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

  const parsed = internalReadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  try {
    const count = await markRead(parsed.data.userId, parsed.data.conversationId);
    return Response.json({ ok: true, count });
  } catch (err) {
    if (err instanceof ChatServiceError) {
      return Response.json({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("[internal/socket/read]", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
