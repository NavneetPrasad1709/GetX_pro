import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";

/**
 * GETX Pro renewal sweep (Prompt 15). Downgrades sellers whose subscription has
 * lapsed back to FREE (commission reverts to base on their NEXT order — existing
 * orders snapshot the rate at creation, so nothing re-prices). Idempotent.
 * Fail-closed Bearer CRON_SECRET.
 *
 * NOTE: auto-charging renewals from the wallet is deferred — wallet balance may
 * be insufficient and silent debits are a trust risk. Sellers re-subscribe
 * manually; expiry-soon reminders arrive with the notification system (Step 22).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) return new Response("Unauthorized", { status: 401 });

  try {
    const now = new Date();
    const res = await db.sellerProfile.updateMany({
      where: { subscriptionTier: "PRO", subscriptionExpiresAt: { lt: now } },
      data: { subscriptionTier: "FREE", subscriptionExpiresAt: null },
    });
    console.log(`[cron:subscription-renewal] downgraded ${res.count}`);
    return Response.json({ downgraded: res.count });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[cron:subscription-renewal] failed", err);
    return new Response("Internal error", { status: 500 });
  }
}
