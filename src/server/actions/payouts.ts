"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  markFailedSchema,
  markPaidSchema,
  requestPayoutSchema,
} from "@/lib/validators/payout";
import {
  getLedgerHistory,
  type LedgerHistoryItem,
  markPayoutFailed,
  markPayoutPaid,
  PayoutServiceError,
  requestPayout,
} from "@/server/services/payouts";

/**
 * Payout server actions (Step 14). The seller request is a money path — balance
 * + reservation live in the service (wallet-locked transaction). Admin actions
 * are role-gated here; the service stays auth-agnostic so a future automated
 * payout webhook can call the same idempotent functions.
 */

export type PayoutActionResult = { ok: true } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

export async function requestPayoutAction(
  raw: unknown,
): Promise<PayoutActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please log in." };

  const rl = rateLimit(`payout-request:${session.user.id}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = requestPayoutSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await requestPayout(
      session.user.id,
      parsed.data.amount,
      parsed.data.instant ?? false,
    );
    revalidatePath("/seller/wallet");
    revalidatePath("/seller");
    return { ok: true };
  } catch (err) {
    if (err instanceof PayoutServiceError) return { ok: false, error: err.message };
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[requestPayoutAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export type LoadLedgerResult =
  | { ok: true; items: LedgerHistoryItem[]; nextCursor: string | null }
  | { ok: false };

/** Paginated/filtered ledger for the seller's own wallet (wallet page island). */
export async function loadLedgerAction(
  rawFilter: unknown,
  rawCursor: unknown,
): Promise<LoadLedgerResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };

  const filter =
    rawFilter === "credits" || rawFilter === "debits" ? rawFilter : "all";
  const cursor =
    typeof rawCursor === "string" && /^[a-z0-9]+$/i.test(rawCursor)
      ? rawCursor
      : undefined;

  const page = await getLedgerHistory(session.user.id, { filter, cursor });
  return { ok: true, items: page.items, nextCursor: page.nextCursor };
}

async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id && session.user.role === "ADMIN" ? session.user.id : null;
}

export async function markPayoutPaidAction(
  raw: unknown,
): Promise<PayoutActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "Forbidden." };

  const rl = rateLimit(`payout-paid:${adminId}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = markPaidSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    const res = await markPayoutPaid(adminId, parsed.data.payoutId, parsed.data.providerRef);
    revalidatePath("/admin/payouts");
    return res === "noop"
      ? { ok: false, error: "That payout was already processed." }
      : { ok: true };
  } catch (err) {
    if (err instanceof PayoutServiceError) return { ok: false, error: err.message };
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[markPayoutPaidAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export async function markPayoutFailedAction(
  raw: unknown,
): Promise<PayoutActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "Forbidden." };

  const rl = rateLimit(`payout-failed:${adminId}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = markFailedSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  try {
    const res = await markPayoutFailed(adminId, parsed.data.payoutId, parsed.data.reason);
    revalidatePath("/admin/payouts");
    return res === "noop"
      ? { ok: false, error: "That payout was already processed." }
      : { ok: true };
  } catch (err) {
    if (err instanceof PayoutServiceError) return { ok: false, error: err.message };
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[markPayoutFailedAction]", err);
    return { ok: false, error: GENERIC };
  }
}
