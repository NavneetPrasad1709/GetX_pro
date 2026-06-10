"use server";

import { captureException } from "@sentry/nextjs";
import type { KycStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { isSumsubEnabled } from "@/lib/sumsub-config";
import {
  createApplicant,
  generateSDKToken,
  getApplicantStatus,
  applyKycReview,
  KycSumsubError,
} from "@/server/services/kyc-sumsub";

/**
 * Sumsub KYC server actions (Step 29). SELLER-gated. Both degrade gracefully when Sumsub is off
 * or errors — the seller can always fall back to the manual upload flow. KYC mutations are
 * transactional + idempotent in the service.
 */

export type ApplicantResult =
  | { applicantId: string; sdkToken: string }
  | { error: "sumsub_disabled" | "sumsub_error" | "forbidden" };

export async function getOrCreateApplicantAction(): Promise<ApplicantResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SELLER") return { error: "forbidden" };
  if (!isSumsubEnabled()) return { error: "sumsub_disabled" };
  if (!rateLimit(`sumsub:${session.user.id}`, { limit: 10, windowMs: 60_000 }).ok) {
    return { error: "sumsub_error" };
  }
  try {
    const applicantId = await createApplicant(session.user.id, session.user.email ?? "");
    const sdkToken = await generateSDKToken(applicantId, session.user.id);
    return { applicantId, sdkToken };
  } catch (err) {
    if (!(err instanceof KycSumsubError)) captureException(err);
    return { error: "sumsub_error" };
  }
}

export async function pollKycStatusAction(): Promise<{ status: KycStatus }> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SELLER") return { status: "NONE" };

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { sumsubApplicantId: true },
  });
  if (!user?.sumsubApplicantId) return { status: "NONE" };

  const review = await getApplicantStatus(user.sumsubApplicantId);
  if (review.reviewAnswer === "GREEN" || review.reviewAnswer === "RED") {
    const res = await applyKycReview(user.sumsubApplicantId, review.reviewAnswer, "sumsub_poll", review.rejectLabels);
    return { status: res.status };
  }

  const profile = await db.sellerProfile.findUnique({
    where: { userId: session.user.id },
    select: { kycStatus: true },
  });
  return { status: profile?.kycStatus ?? "NONE" };
}
