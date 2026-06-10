import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";

/**
 * Stale-listing auto-pause sweep (Prompt 12). Vercel Cron hits this daily and
 * PAUSES every ACTIVE listing that has either expired (`expiresAt < now`) or
 * gone quiet (`lastActivityAt < now - STALE_DAYS`). Each affected seller gets a
 * Notification row + an AuditLog entry.
 *
 * AUTH: identical constant-time Bearer check to /api/cron/auto-release. Fail
 * closed — no CRON_SECRET configured ⇒ every call is rejected.
 *
 * IDEMPOTENT: the updateMany is scoped to `status: ACTIVE`, so a second run (or
 * a manual + scheduled overlap) re-selects nothing already paused.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_DAYS = siteConfig.liquidity.staleListingDays;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
/** Cap one sweep so a backlog can't blow the function timeout; next run clears the rest. */
const BATCH = 500;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - STALE_MS);

    // 1. Find the stale/expired ACTIVE listings (with seller + title for the notice).
    const due = await db.listing.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { expiresAt: { lt: now } },
          { lastActivityAt: { lt: staleCutoff } },
        ],
      },
      select: { id: true, title: true, seller: { select: { userId: true } } },
      take: BATCH,
    });

    if (due.length === 0) {
      return Response.json({ paused: 0 });
    }

    const ids = due.map((l) => l.id);

    // 2. Pause + notify + audit in ONE transaction (no per-listing loops of writes).
    await db.$transaction([
      db.listing.updateMany({
        where: { id: { in: ids }, status: "ACTIVE" },
        data: { status: "PAUSED" },
      }),
      db.notification.createMany({
        data: due.map((l) => ({
          userId: l.seller.userId,
          type: "SYSTEM" as const,
          title: "Your listing was paused",
          body: `Your listing "${l.title}" was auto-paused after ${STALE_DAYS} days of inactivity. Reactivate it any time to keep selling.`,
          link: "/seller/listings",
        })),
      }),
      db.auditLog.createMany({
        data: ids.map((id) => ({
          actorId: null,
          action: "LISTING_AUTO_PAUSED",
          entity: "Listing",
          entityId: id,
          meta: { reason: "stale", staleDays: STALE_DAYS },
        })),
      }),
    ]);

    console.log(`[cron:auto-pause-stale] paused ${ids.length}`);
    return Response.json({ paused: ids.length, capped: due.length === BATCH });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[cron:auto-pause-stale] sweep failed", err);
    return new Response("Internal error", { status: 500 });
  }
}
