import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { aggregateMarketSignals } from "@/server/services/demand-forecast";

/**
 * Daily demand-signal aggregation (Step 26). Rolls yesterday's COMPLETED orders + searches into
 * MarketSignal rows. Fail-closed constant-time Bearer check (same as the other crons). Idempotent
 * (upsert), so a re-run produces identical rows.
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

  try {
    const signalsUpserted = await aggregateMarketSignals();
    console.log(`[cron:demand-signals] upserted ${signalsUpserted} signal(s)`);
    return Response.json({ ok: true, signalsUpserted });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[cron:demand-signals] failed", err);
    return new Response("Internal error", { status: 500 });
  }
}
