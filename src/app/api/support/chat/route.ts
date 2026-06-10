import { captureException } from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { isAiEnabled, streamSupportResponse } from "@/lib/ai";
import { buildSystemPrompt } from "@/lib/support-prompt";
import { supportChatSchema } from "@/lib/validators/support";
import {
  createSupportTicket,
  detectEscalation,
  getSupportContext,
} from "@/server/services/support";

/**
 * AI Support bot streaming endpoint (Step 16). POST a running conversation; get back an
 * SSE stream of `{ delta }` text events, ending in `{ done, escalated }`.
 *
 * Guards (in order): feature on (503 when no ANTHROPIC_API_KEY) → rate limit 30/hr (429)
 * → input validation (400). Context is injected SERVER-SIDE from the session — the client's
 * claimed identity is never trusted. Escalation files a SupportTicket for a human.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE = { limit: 30, windowMs: 60 * 60 * 1000 }; // 30 messages / hour

export async function POST(req: Request): Promise<Response> {
  // 1. Feature gate — with no AI key the bot is off; widget hides on this 503.
  if (!isAiEnabled()) {
    return Response.json({ error: "Support unavailable" }, { status: 503 });
  }

  // 2. Identity (optional — guest support is allowed) + rate limit.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const rlKey = userId ? `support:user:${userId}` : `support:ip:${await getClientIp()}`;
  if (!rateLimit(rlKey, RATE).ok) {
    return Response.json(
      { error: "Rate limit reached. Try again in an hour." },
      { status: 429 },
    );
  }

  // 3. Validate input (caps content at 500 chars, history at 20 turns).
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = supportChatSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { messages } = parsed.data;
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // 4. Server-verified context → system prompt.
  const context = userId ? await getSupportContext(userId) : "";
  const system = buildSystemPrompt(context);

  // 5. Stream the reply as SSE; detect escalation after the full reply lands.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let full = "";
      try {
        for await (const delta of streamSupportResponse(messages, system)) {
          full += delta;
          send({ delta });
        }
      } catch (err) {
        captureException(err);
        send({ error: "AI temporarily unavailable. Please try again." });
        controller.close();
        return;
      }

      let escalated = false;
      if (detectEscalation(lastUser, full)) {
        escalated = true;
        const notice =
          "\n\nI'm escalating this to a human team member who will follow up with you.";
        send({ delta: notice });
        try {
          await createSupportTicket(userId, [
            ...messages,
            { role: "assistant", content: `${full}${notice}` },
          ]);
        } catch (err) {
          // A ticket-write failure must not break the user's chat.
          captureException(err);
        }
      }

      send({ done: true, escalated });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable proxy buffering so deltas flush immediately
    },
  });
}
