import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";

/**
 * Sentry verification endpoint (Step 31). ADMIN-only. Hit it after deploy to confirm events reach
 * the Sentry dashboard. Committed but harmless — non-admins get 403.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  Sentry.captureException(new Error("[GETX] Sentry test error — Step 31 verification"));
  return NextResponse.json({ ok: true, message: "Test error sent to Sentry." });
}
