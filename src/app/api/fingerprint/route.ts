import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  checkIpMultiAccount,
  checkDeviceMultiAccount,
} from "@/server/services/fraud/signals";

/**
 * Device-fingerprint beacon (Prompt 16). The client posts an opaque device hash
 * on signup + first authenticated load. This is also where we capture
 * `lastLoginIp`/`lastLoginAt` (reliable request IP — the Auth.js callback can't
 * see it) and fire the account-integrity signals fire-and-forget.
 *
 * Never exposes signal results to the client. < 100ms: one upsert + one update;
 * the signals run detached.
 */

export const runtime = "nodejs";

const bodySchema = z.object({ fingerprint: z.string().min(10).max(64) });

export async function POST(req: Request): Promise<Response> {
  const session = await requireUser();
  const userId = session.user.id;

  if (!rateLimit(`fingerprint:${userId}`, { limit: 5, windowMs: 60_000 }).ok) {
    return new Response("Too many requests", { status: 429 });
  }

  let parsed: { fingerprint: string };
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return new Response("Invalid request", { status: 400 });
  }

  const ip = await getClientIp();
  const userAgent = req.headers.get("user-agent")?.slice(0, 400) ?? null;

  try {
    await Promise.all([
      db.deviceFingerprint.upsert({
        where: {
          userId_fingerprint: { userId, fingerprint: parsed.fingerprint },
        },
        create: { userId, fingerprint: parsed.fingerprint, ipAddress: ip, userAgent },
        update: { ipAddress: ip, userAgent, createdAt: new Date() },
      }),
      db.user.update({
        where: { id: userId },
        data: { lastLoginIp: ip, lastLoginAt: new Date() },
      }),
    ]);
  } catch (err) {
    Sentry.captureException(err);
    // Non-critical telemetry — never fail the page over it.
    return Response.json({ ok: true });
  }

  // Account-integrity signals — fire-and-forget, never block the response.
  void checkIpMultiAccount(userId, ip).catch((e) => {
    console.error("[fraud-signal] ip_multi_account failed:", e);
    Sentry.captureException(e, { tags: { signal: "ip_multi_account" } });
  });
  void checkDeviceMultiAccount(userId, parsed.fingerprint, ip).catch((e) => {
    console.error("[fraud-signal] device_multi_account failed:", e);
    Sentry.captureException(e, { tags: { signal: "device_multi_account" } });
  });

  return Response.json({ ok: true });
}
