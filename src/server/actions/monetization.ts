"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  subscribePro,
  MonetizationServiceError,
} from "@/server/services/monetization";

/**
 * Opt-in monetization actions (Prompt 15) — GETX Pro only. Auth + rate-limit
 * re-checked here; money rules enforced inside the service transaction. (Boost,
 * Bump and Spotlight were removed — ranking is fully organic, O-T15.)
 */

export type MonetizationResult = { ok: true } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

export async function subscribeProAction(): Promise<MonetizationResult> {
  const session = await requireUser();
  const user = { id: session.user.id, role: session.user.role };
  if (!rateLimit(`subscribe:${user.id}`, { limit: 5, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests — slow down a moment." };
  }

  try {
    await subscribePro(user);
    revalidatePath("/seller");
    revalidatePath("/seller/subscription");
    return { ok: true };
  } catch (err) {
    if (err instanceof MonetizationServiceError) {
      return { ok: false, error: err.message };
    }
    Sentry.captureException(err);
    console.error("[subscribeProAction]", err);
    return { ok: false, error: GENERIC };
  }
}
