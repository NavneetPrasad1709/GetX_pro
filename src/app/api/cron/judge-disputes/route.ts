import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { isAiEnabled } from "@/lib/ai";
import { judgeDispute } from "@/server/services/dispute-judge";

/**
 * AI Dispute Judge — durable backstop (Step 25).
 *
 * The fast path is a fire-and-forget setTimeout(0) at dispute creation, but a
 * serverless function can freeze/return before that macrotask runs and drop the
 * job. This cron is the SAFETY NET: it picks up any OPEN dispute the judge hasn't
 * scored yet (`judgedAt IS NULL`) so a dropped fast-path job is only DELAYED by
 * one cron interval, never lost. Idempotent — judgeDispute no-ops a resolved one.
 *
 * Auth: same constant-time Bearer check as the other crons. Fail-closed.
 * Dormant without ANTHROPIC_API_KEY (judge would throw — we skip cleanly).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 25;

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
  // No key → the judge is dormant; nothing to do (admins resolve manually).
  if (!isAiEnabled()) {
    return Response.json({ ok: true, skipped: "ai_disabled" });
  }

  const pending = await db.dispute.findMany({
    where: { status: "OPEN", judgedAt: null },
    select: { id: true },
    take: BATCH,
    orderBy: { createdAt: "asc" },
  });

  let done = 0;
  const failed: string[] = [];
  for (const { id } of pending) {
    try {
      await judgeDispute(id);
      done += 1;
    } catch (err) {
      console.error(`[cron:judge-disputes] dispute ${id} failed`, err);
      Sentry.captureException(err);
      failed.push(id);
    }
  }

  if (failed.length > 0) await Sentry.flush(2000);
  console.log(`[cron:judge-disputes] scanned ${pending.length}, done ${done}, failed ${failed.length}`);
  return Response.json({ ok: true, scanned: pending.length, done, failed });
}
