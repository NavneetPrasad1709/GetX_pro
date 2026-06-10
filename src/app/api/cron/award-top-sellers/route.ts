import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { awardTopSellerBadges } from "@/server/services/badges";

/**
 * Monthly TOP_SELLER badge sweep (Step 27). Awards the badge to the top 10 sellers per game by
 * completed orders in the last 30 days. Fail-closed Bearer check; if CRON_SECRET is unset, returns
 * 503 (feature disabled) rather than running unauthenticated. Idempotent (badges are permanent).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    Sentry.captureMessage("award-top-sellers cron hit but CRON_SECRET is unset", "warning");
    return new Response("Cron disabled", { status: 503 });
  }
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const awarded = await awardTopSellerBadges();
    console.log(`[cron:award-top-sellers] awarded ${awarded} TOP_SELLER badge(s)`);
    return Response.json({ ok: true, awarded });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    return new Response("Internal error", { status: 500 });
  }
}
