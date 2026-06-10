"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { submitKycSchema } from "@/lib/validators/kyc";
import { KycServiceError, submitKyc } from "@/server/services/kyc";

/**
 * KYC server action (Step 12). The document is already uploaded to the PRIVATE
 * bucket (presigned); this records the submission. Standard shape: auth →
 * per-user rate limit → Zod → service (which re-verifies the key prefix).
 */

export type SubmitKycResult = { ok: true } | { ok: false; error: string };

export async function submitKycAction(raw: unknown): Promise<SubmitKycResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please log in." };
  const userId = session.user.id;

  const rl = rateLimit(`kyc-submit:${userId}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = submitKycSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await submitKyc(userId, parsed.data.docType, parsed.data.key);
    revalidatePath("/seller/verify");
    revalidatePath("/seller");
    return { ok: true };
  } catch (err) {
    if (err instanceof KycServiceError) return { ok: false, error: err.message };
    console.error("[submitKycAction]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
