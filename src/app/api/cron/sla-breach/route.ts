import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { sweepSlaBreaches } from "@/server/services/work-queue";

/**
 * Ops SLA-breach sweep (Prompt 24). Vercel Cron hits this on a schedule (see
 * vercel.json) and escalates every open WorkTicket past its SLA deadline to
 * CRITICAL, writing an `SLA_BREACHED` audit entry. Idempotent: a ticket bumped to
 * CRITICAL is excluded from the next sweep, so each breach is logged exactly once.
 *
 * AUTH: same fail-closed Bearer CRON_SECRET pattern as the escrow auto-release.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const summary = await sweepSlaBreaches();
    if (summary.escalated > 0) {
      console.log(
        `[cron:sla-breach] scanned ${summary.scanned}, escalated ${summary.escalated} to CRITICAL`,
      );
    }
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[cron:sla-breach] sweep failed", err);
    return new Response("Internal error", { status: 500 });
  }
}
