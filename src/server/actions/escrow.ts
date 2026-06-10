"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  confirmReceiptSchema,
  deliverSchema,
  openDisputeSchema,
} from "@/lib/validators/escrow";
import {
  confirmReceipt,
  EscrowServiceError,
  markDelivered,
  openDispute,
} from "@/server/services/escrow";

/**
 * Escrow/delivery server actions (Step 10). Standard mutation shape:
 *   1. auth()  2. per-user rate limit (userId only — never client IP)  3. Zod
 *   4. service (ownership + state machine + ledger live there).
 * Money never comes from the client; the service recomputes it from the DB.
 */

export type EscrowActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function authedUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** Refresh every surface an escrow transition changes. */
function revalidateOrderViews(orderId: string): void {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/seller/orders");
  revalidatePath("/seller");
}

export async function markDeliveredAction(
  raw: unknown,
): Promise<EscrowActionResult> {
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Please log in to deliver this order." };

  const rl = rateLimit(`deliver:${userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = deliverSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await markDelivered(userId, parsed.data.orderId, parsed.data.content);
    revalidateOrderViews(parsed.data.orderId);
    return { ok: true };
  } catch (err) {
    if (err instanceof EscrowServiceError) return { ok: false, error: err.message };
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[markDeliveredAction]", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function confirmReceiptAction(
  raw: unknown,
): Promise<EscrowActionResult> {
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Please log in to confirm this order." };

  const rl = rateLimit(`confirm:${userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = confirmReceiptSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  try {
    await confirmReceipt(userId, parsed.data.orderId);
    revalidateOrderViews(parsed.data.orderId);
    return { ok: true };
  } catch (err) {
    if (err instanceof EscrowServiceError) return { ok: false, error: err.message };
    // Release is a money path — make sure unexpected failures are never silent.
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[confirmReceiptAction]", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function openDisputeAction(
  raw: unknown,
): Promise<EscrowActionResult> {
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Please log in to open a dispute." };

  const rl = rateLimit(`dispute:${userId}`, { limit: 15, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = openDisputeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await openDispute(userId, parsed.data.orderId, parsed.data.reason);
    revalidateOrderViews(parsed.data.orderId);
    return { ok: true };
  } catch (err) {
    if (err instanceof EscrowServiceError) return { ok: false, error: err.message };
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[openDisputeAction]", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
