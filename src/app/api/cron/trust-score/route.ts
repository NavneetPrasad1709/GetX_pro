import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { recomputeSellerTrustAndLevel } from "@/server/services/trust-score";

/**
 * Nightly trust score sweep (Prompt 11 / Step 17). Vercel Cron fires at 02:00
 * UTC — recomputes trust score + seller level for every SellerProfile that has
 * NOT been manually overridden (`trustScoreOverride = false`).
 *
 * Auth: same constant-time Bearer check as auto-release. Fail-closed.
 * Batch: 200 sellers per run; next morning cron clears the remainder.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 200;

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
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sellers = await db.sellerProfile.findMany({
    where: { trustScoreOverride: false },
    select: { id: true },
    take: BATCH,
    orderBy: { trustScoreUpdatedAt: "asc" },
  });

  let done = 0;
  const failed: string[] = [];

  for (const { id } of sellers) {
    try {
      await recomputeSellerTrustAndLevel(id);
      done += 1;
    } catch (err) {
      console.error(`[cron:trust-score] seller ${id} failed`, err);
      Sentry.captureException(err);
      failed.push(id);
    }
  }

  if (failed.length > 0) {
    Sentry.captureMessage(
      `Trust score recompute failed for ${failed.length} seller(s): ${failed.join(", ")}`,
      "error",
    );
    await Sentry.flush(2000);
  }

  console.log(
    `[cron:trust-score] scanned ${sellers.length}, done ${done}, failed ${failed.length}`,
  );
  return Response.json({ ok: true, scanned: sellers.length, done, failed });
}
