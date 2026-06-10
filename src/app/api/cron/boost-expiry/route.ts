import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";

/**
 * Boost-expiry sweep (Prompt 15). Clears `isFeatured` on listings whose paid
 * boost window has lapsed. Idempotent (scoped to isFeatured=true). Fail-closed
 * Bearer CRON_SECRET — same pattern as the auto-release / auto-pause crons.
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
    const res = await db.listing.updateMany({
      where: { isFeatured: true, boostExpiresAt: { lt: new Date() } },
      data: { isFeatured: false },
    });
    console.log(`[cron:boost-expiry] cleared ${res.count}`);
    return Response.json({ cleared: res.count });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[cron:boost-expiry] failed", err);
    return new Response("Internal error", { status: 500 });
  }
}
