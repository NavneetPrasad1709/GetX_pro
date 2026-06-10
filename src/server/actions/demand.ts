"use server";

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  captureWishlistDemand,
  LiquidityServiceError,
} from "@/server/services/liquidity";

/**
 * Anonymous "notify me when a seller lists here" capture (Prompt 12).
 * No auth required — buyers leaving demand for empty categories may not have an
 * account yet. Re-validated server-side (Zod) + IP rate-limited (no userId for
 * anonymous visitors). Idempotent in the service via unique [email, categoryId].
 */

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");

const demandSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  categoryId: id,
  gameId: id,
});

export type DemandActionResult = { ok: true } | { ok: false; error: string };

export async function captureDemandAction(
  raw: unknown,
): Promise<DemandActionResult> {
  const parsed = demandSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  // Anonymous → rate-limit by IP: max 5 demand signals per IP per hour.
  const ip = await getClientIp();
  const limit = rateLimit(`demand:${ip}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!limit.ok) {
    return {
      ok: false,
      error: "You've submitted a few already — please try again later.",
    };
  }

  try {
    await captureWishlistDemand(
      parsed.data.email,
      parsed.data.categoryId,
      parsed.data.gameId,
    );
    return { ok: true };
  } catch (err) {
    if (err instanceof LiquidityServiceError) {
      return { ok: false, error: err.message };
    }
    Sentry.captureException(err);
    console.error("[captureDemandAction]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
