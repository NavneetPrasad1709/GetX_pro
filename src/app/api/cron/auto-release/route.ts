import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { runAutoRelease } from "@/server/services/escrow";

/**
 * Escrow auto-release sweep (Step 10, guardrails §4). Vercel Cron hits this on a
 * schedule (see vercel.json) and it releases every DELIVERED order past its
 * 3-day buyer-protection deadline — funds move from escrow hold to the seller's
 * wallet. Idempotent: the release CAS makes a double-fire a no-op, so re-running
 * the sweep (or a manual + scheduled overlap) can never double-pay.
 *
 * AUTH: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to cron requests
 * when CRON_SECRET is set. We verify it in constant time and FAIL CLOSED — no
 * secret configured ⇒ every call is rejected (the sweep must never run open).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — configure CRON_SECRET to enable the sweep
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on unequal-length buffers.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runAutoRelease();

    if (summary.failed.length > 0) {
      Sentry.captureMessage(
        `Auto-release failed for ${summary.failed.length} order(s): ${summary.failed.join(", ")}`,
        "error",
      );
      await Sentry.flush(2000);
    }

    console.log(
      `[cron:auto-release] scanned ${summary.scanned}, released ${summary.released}, ` +
        `failed ${summary.failed.length}, capped ${summary.capped}`,
    );
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    // Transient fault — 500 so the next scheduled sweep retries cleanly.
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[cron:auto-release] sweep failed", err);
    return new Response("Internal error", { status: 500 });
  }
}
