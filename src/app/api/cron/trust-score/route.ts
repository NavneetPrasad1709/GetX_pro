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
 * Batch: 200 sellers per run; next morning cron clears the remainder. Within a
 * run, sellers are recomputed CONCURRENCY at a time (P8-T3) — each recompute is
 * independent, so this cuts wall-clock ~10× while staying under the pooled
 * (pgbouncer) connection limit.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 200;
const CONCURRENCY = 10;

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

  // Process in fixed-size concurrent chunks (bounded so we never exceed the
  // pooled Neon connection limit). One slow/failing seller can't stall the rest.
  for (let i = 0; i < sellers.length; i += CONCURRENCY) {
    const chunk = sellers.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(({ id }) => recomputeSellerTrustAndLevel(id)),
    );
    results.forEach((res, j) => {
      if (res.status === "fulfilled") {
        done += 1;
      } else {
        const id = chunk[j].id;
        console.error(`[cron:trust-score] seller ${id} failed`, res.reason);
        Sentry.captureException(res.reason);
        failed.push(id);
      }
    });
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
