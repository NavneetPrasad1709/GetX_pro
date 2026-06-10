import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { isInternalRequest } from "@/lib/internal-auth";
import { pushNotificationToSocket } from "@/lib/socket-notify";

/**
 * Internal: push a `notification:new` event to a user's realtime socket room
 * (Step 22). Authenticated server-to-server entrypoint (INTERNAL_API_SECRET) that
 * forwards to the Socket.io server's own `/notify` endpoint. The notification
 * service pushes directly via the same helper; this route exists as the spec'd,
 * authenticated channel for any other server-side caller. Fail-closed on auth.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  userId: z.string().min(1).max(64),
  notification: z.object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(40),
    title: z.string().max(200),
    body: z.string().max(500),
    link: z.string().max(512).nullable(),
    read: z.boolean(),
    createdAt: z.string().min(1).max(40),
  }),
});

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

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  try {
    await pushNotificationToSocket(parsed.data.userId, parsed.data.notification);
    return Response.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
