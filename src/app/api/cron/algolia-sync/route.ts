import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { isAlgoliaConfigured } from "@/lib/algolia";
import { bulkSyncAllListings } from "@/server/services/search-sync";

/**
 * Nightly Algolia reconciliation (Step 28). Re-syncs all listings (ACTIVE upserted, others deleted)
 * so any missed fire-and-forget sync self-heals. Fail-closed Bearer; degrades to a 200 "skipped"
 * when Algolia isn't configured (Postgres search keeps serving — never a crash).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  if (!isAlgoliaConfigured() && !process.env.ALGOLIA_ADMIN_KEY) {
    return Response.json({ ok: true, skipped: "algolia not configured" });
  }

  try {
    const summary = await bulkSyncAllListings();
    console.log("[cron:algolia-sync]", summary);
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    return new Response("Internal error", { status: 500 });
  }
}
