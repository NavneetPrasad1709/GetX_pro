import { createHmac, timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { SumsubWebhookSchema } from "@/lib/validators/kyc-sumsub";
import { applyKycReview } from "@/server/services/kyc-sumsub";

/**
 * Sumsub webhook (Step 29). FAIL-CLOSED on signature: no secret or a bad/missing `x-payload-digest`
 * → 401 immediately, never process an unverified event. The only event we act on is
 * `applicantReviewed` (GREEN→APPROVED / RED→REJECTED), applied idempotently via the KYC state guard.
 * Errors return 500 so Sumsub retries; unknown event types are 200 no-ops (forward-compatible).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.SUMSUB_SECRET_KEY;
  if (!secret) return new Response("Unauthorized", { status: 401 });

  const raw = await req.text(); // raw bytes for HMAC — never req.json() first
  const provided = req.headers.get("x-payload-digest");
  if (!provided) return new Response("Unauthorized", { status: 401 });

  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const parsed = SumsubWebhookSchema.safeParse(body);
  if (!parsed.success) {
    Sentry.captureMessage("Sumsub webhook failed Zod validation", "warning");
    return new Response("Bad request", { status: 400 });
  }
  const event = parsed.data;

  try {
    if (event.type === "applicantReviewed") {
      const answer = event.reviewResult?.reviewAnswer;
      if (answer === "GREEN" || answer === "RED") {
        const res = await applyKycReview(
          event.applicantId,
          answer,
          "sumsub_webhook",
          event.reviewResult?.rejectLabels,
        );
        if (res.status === "NONE") {
          // unknown/deleted applicant — ack so Sumsub stops retrying, but flag it
          Sentry.captureMessage(`Sumsub webhook: no user for applicant ${event.applicantId}`, "warning");
        }
      }
    }
    // any other type → no-op 200 (forward-compatible)
    return Response.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    return new Response("Internal error", { status: 500 });
  }
}
