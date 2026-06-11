"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  acceptAiVerdictSchema,
  banUserSchema,
  kycUrlSchema,
  overrideAiVerdictSchema,
  overrideTrustScoreSchema,
  removeListingSchema,
  resolveDisputeSchema,
  reviewKycSchema,
  setRoleSchema,
} from "@/lib/validators/admin";
import { acceptAiVerdict, overrideAiVerdict } from "@/server/services/dispute-judge";
import {
  AdminServiceError,
  removeListingAsAdmin,
  setUserBanned,
  setUserRole,
} from "@/server/services/admin";
import { getKycDocSignedUrl, KycServiceError, reviewKyc } from "@/server/services/kyc";
import { EscrowServiceError, resolveDispute } from "@/server/services/escrow";
import { clearListingBoost } from "@/server/services/monetization";
import { db } from "@/lib/db";

/**
 * Admin server actions (Step 15). EVERY action is ADMIN-gated here; the services
 * write the AuditLog. Money decisions (dispute resolve) go through escrow in a
 * transaction. KYC docs are only ever exposed via a short-lived signed URL.
 */

export type AdminActionResult = { ok: true } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

async function requireAdmin(): Promise<{ id: string; role: "ADMIN" } | null> {
  const session = await auth();
  return session?.user?.id && session.user.role === "ADMIN"
    ? { id: session.user.id, role: "ADMIN" }
    : null;
}

function limited(adminId: string): boolean {
  return !rateLimit(`admin:${adminId}`, { limit: 120, windowMs: 60_000 }).ok;
}

export async function banUserAction(raw: unknown): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = banUserSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    await setUserBanned(admin.id, parsed.data.userId, parsed.data.banned);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminServiceError) return { ok: false, error: err.message };
    console.error("[banUserAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export async function setUserRoleAction(raw: unknown): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = setRoleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    await setUserRole(admin.id, parsed.data.userId, parsed.data.role);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminServiceError) return { ok: false, error: err.message };
    console.error("[setUserRoleAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export async function removeListingAction(raw: unknown): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = removeListingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    await removeListingAsAdmin(admin.id, parsed.data.listingId);
    revalidatePath("/admin/listings");
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminServiceError) return { ok: false, error: err.message };
    console.error("[removeListingAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export async function reviewKycAction(raw: unknown): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = reviewKycSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    await reviewKyc(admin.id, parsed.data.submissionId, parsed.data.decision, parsed.data.note);
    revalidatePath("/admin/kyc");
    return { ok: true };
  } catch (err) {
    if (err instanceof KycServiceError) return { ok: false, error: err.message };
    console.error("[reviewKycAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export type KycUrlResult = { ok: true; url: string } | { ok: false; error: string };

/** Mint a short-lived signed GET URL for a KYC doc (admin views it, then it expires). */
export async function kycSignedUrlAction(raw: unknown): Promise<KycUrlResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = kycUrlSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const url = await getKycDocSignedUrl(admin, parsed.data.submissionId);
    return { ok: true, url };
  } catch (err) {
    if (err instanceof KycServiceError) return { ok: false, error: err.message };
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[kycSignedUrlAction]", err);
    return { ok: false, error: "Could not open the document." };
  }
}

export async function resolveDisputeAction(raw: unknown): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = resolveDisputeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  try {
    await resolveDispute(admin.id, parsed.data.orderId, parsed.data.outcome, parsed.data.note);
    revalidatePath("/admin/disputes");
    revalidatePath(`/orders/${parsed.data.orderId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof EscrowServiceError) return { ok: false, error: err.message };
    // Money path — make sure unexpected failures aren't silent.
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[resolveDisputeAction]", err);
    return { ok: false, error: GENERIC };
  }
}

/** Admin accepts the AI Dispute Judge's suggested verdict on an OPEN dispute (Step 25). */
export async function acceptAiVerdictAction(raw: unknown): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = acceptAiVerdictSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const result = await acceptAiVerdict(admin.id, parsed.data.disputeId);
  if (!result.ok) return { ok: false, error: result.error };
  // The dispute detail page is keyed by orderId; also refresh the order view.
  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${result.orderId}`);
  revalidatePath(`/orders/${result.orderId}`);
  return { ok: true };
}

/** Admin overrides the AI verdict, resolving with their chosen verdict + reason (Step 25). */
export async function overrideAiVerdictAction(raw: unknown): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = overrideAiVerdictSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const result = await overrideAiVerdict(
    admin.id,
    parsed.data.disputeId,
    parsed.data.verdict,
    parsed.data.reason,
  );
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${result.orderId}`);
  revalidatePath(`/orders/${result.orderId}`);
  return { ok: true };
}

/**
 * Admin manually overrides a seller's trust score and/or level, and locks it
 * from the nightly cron sweep until the override is cleared. Audit-logged.
 */
/** Admin force-clears a listing's paid boost (fraud/abuse recourse). Audit-logged. */
export async function clearListingBoostAction(
  raw: unknown,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = removeListingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    await clearListingBoost(parsed.data.listingId);
    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "LISTING_BOOST_CLEARED",
        entity: "Listing",
        entityId: parsed.data.listingId,
      },
    });
    revalidatePath("/admin/listings");
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    console.error("[clearListingBoostAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export async function overrideTrustScoreAction(
  raw: unknown,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = overrideTrustScoreSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  const { sellerId, trustScore, sellerLevel, note } = parsed.data;

  try {
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.sellerProfile.update({
        where: { id: sellerId },
        data: {
          trustScore,
          trustScoreOverride: true,
          trustScoreUpdatedAt: now,
          sellerLevel,
          sellerLevelUpdatedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "TRUST_SCORE_OVERRIDE",
          entity: "SellerProfile",
          entityId: sellerId,
          meta: { trustScore, sellerLevel, note: note ?? null },
        },
      });
    });
    revalidatePath("/admin/sellers");
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    console.error("[overrideTrustScoreAction]", err);
    return { ok: false, error: GENERIC };
  }
}
