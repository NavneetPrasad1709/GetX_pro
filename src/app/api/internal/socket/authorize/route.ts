import { isInternalRequest } from "@/lib/internal-auth";
import { internalAuthorizeSchema } from "@/lib/validators/chat";
import { isParticipant } from "@/server/services/chat";

/**
 * Internal: is `userId` allowed to join `conversationId`? (Step 11) Called by the
 * Socket.io server before it adds a socket to a room. Server-to-server only
 * (INTERNAL_API_SECRET). 200 {ok:true} for members, 403 {ok:false} otherwise.
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

  const parsed = internalAuthorizeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const ok = await isParticipant(parsed.data.userId, parsed.data.conversationId);
  return Response.json({ ok }, { status: ok ? 200 : 403 });
}
