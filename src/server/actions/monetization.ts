"use server";

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  boostListing,
  subscribePro,
  sponsorSeller,
  MonetizationServiceError,
} from "@/server/services/monetization";

/**
 * Opt-in monetization actions (Prompt 15). Auth + rate-limit re-checked here;
 * ownership + money rules enforced inside the service transaction.
 */

export type MonetizationResult = { ok: true } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");

const boostSchema = z.object({
  listingId: id,
  duration: z.enum(["daily", "weekly"]),
});

export async function boostListingAction(
  raw: unknown,
): Promise<MonetizationResult> {
  const session = await requireUser();
  const user = { id: session.user.id, role: session.user.role };
  // Wallet-drain guard: cap boost attempts per seller.
  if (!rateLimit(`boost:${user.id}`, { limit: 10, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests — slow down a moment." };
  }

  const parsed = boostSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  try {
    await boostListing(user, parsed.data.listingId, parsed.data.duration);
    revalidatePath("/seller/listings");
    return { ok: true };
  } catch (err) {
    if (err instanceof MonetizationServiceError) {
      return { ok: false, error: err.message };
    }
    Sentry.captureException(err);
    console.error("[boostListingAction]", err);
    return { ok: false, error: GENERIC };
  }
}

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

export async function sponsorSellerAction(): Promise<MonetizationResult> {
  const session = await requireUser();
  const user = { id: session.user.id, role: session.user.role };
  if (!rateLimit(`sponsor:${user.id}`, { limit: 5, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests — slow down a moment." };
  }

  try {
    await sponsorSeller(user);
    revalidatePath("/seller");
    return { ok: true };
  } catch (err) {
    if (err instanceof MonetizationServiceError) {
      return { ok: false, error: err.message };
    }
    Sentry.captureException(err);
    console.error("[sponsorSellerAction]", err);
    return { ok: false, error: GENERIC };
  }
}

