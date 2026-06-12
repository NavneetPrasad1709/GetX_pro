"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { payoutAccountSchema } from "@/lib/validators/payout-account";
import {
  savePayoutAccount,
  PayoutAccountError,
} from "@/server/services/payout-accounts";

export type PayoutAccountResult = { ok: true } | { ok: false; error: string };

/** Save the seller's withdrawal destination. Auth + role + Zod + rate-limit. */
export async function savePayoutAccountAction(
  raw: unknown,
): Promise<PayoutAccountResult> {
  const session = await requireRole("SELLER", "ADMIN");
  const userId = session.user.id;
  if (!rateLimit(`payout-account:${userId}`, { limit: 8, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests — slow down a moment." };
  }
  const parsed = payoutAccountSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  try {
    await savePayoutAccount(userId, parsed.data);
    revalidatePath("/seller/wallet");
    revalidatePath("/seller");
    return { ok: true };
  } catch (err) {
    if (err instanceof PayoutAccountError) return { ok: false, error: err.message };
    Sentry.captureException(err);
    console.error("[savePayoutAccountAction]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
