import type { KycStatus, Role } from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { presignGet } from "@/lib/r2";
import type { KycDocType } from "@/lib/validators/kyc";
import { recomputeSellerTrustAndLevel } from "@/server/services/trust-score";
import { notifyKycDecision } from "@/server/services/notifications";
import { ticketForKyc } from "@/server/services/work-queue";

/**
 * KYC service (Step 12, guardrails §6). Sellers upload an ID document to the
 * PRIVATE R2 bucket; we store ONLY the object key (never a public URL). The doc
 * is read back ONLY by admins, via a short-lived signed GET, and every access is
 * audit-logged. Admin review UI lands in Step 15 — the read helper is here ready.
 */

export class KycServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KycServiceError";
  }
}

export type MyKycStatus = {
  status: KycStatus;
  latestSubmittedAt: Date | null;
};

/** The seller's current KYC status (drives the /seller/verify page). */
export async function getMyKycStatus(userId: string): Promise<MyKycStatus> {
  const profile = await db.sellerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      kycStatus: true,
      kycSubmissions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  if (!profile) throw new KycServiceError("You need a seller account first.");
  return {
    status: profile.kycStatus,
    latestSubmittedAt: profile.kycSubmissions[0]?.createdAt ?? null,
  };
}

/**
 * Record a KYC submission. The `key` MUST sit under this seller's own private
 * prefix (kyc/<sellerId>/…) — a seller can never submit a key pointing at
 * someone else's object. Sets the profile to PENDING for admin review.
 */
export async function submitKyc(
  userId: string,
  docType: KycDocType,
  key: string,
): Promise<void> {
  const profile = await db.sellerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw new KycServiceError("You need a seller account first.");
  const sellerId = profile.id;

  if (!key.startsWith(`kyc/${sellerId}/`)) {
    throw new KycServiceError("That document couldn't be verified — re-upload it.");
  }

  let submissionId = "";
  await db.$transaction(async (tx) => {
    // Lock the profile + re-read status INSIDE the lock so concurrent submits
    // serialize — there is AT MOST ONE PENDING submission per seller at a time.
    // Without this, two PENDING rows could coexist and a later review of a stale
    // one would desync kycStatus (e.g. flip an already-APPROVED seller back).
    await tx.$queryRaw`SELECT id FROM "SellerProfile" WHERE id = ${sellerId} FOR UPDATE`;
    const fresh = await tx.sellerProfile.findUniqueOrThrow({
      where: { id: sellerId },
      select: { kycStatus: true },
    });
    if (fresh.kycStatus === "APPROVED") {
      throw new KycServiceError("Your account is already verified.");
    }
    if (fresh.kycStatus === "PENDING") {
      throw new KycServiceError("You already have a document under review.");
    }

    const submission = await tx.kycSubmission.create({
      data: { sellerId, docType, docUrl: key, status: "PENDING" },
      select: { id: true },
    });
    submissionId = submission.id;
    await tx.sellerProfile.update({
      where: { id: sellerId },
      data: { kycStatus: "PENDING" },
    });
    // Activation milestone (Prompt 14): stamp the FIRST submission only.
    await tx.sellerProfile.updateMany({
      where: { id: sellerId, kycSubmittedAt: null },
      data: { kycSubmittedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "KYC_SUBMITTED",
        entity: "SellerProfile",
        entityId: sellerId,
        meta: { docType },
      },
    });
  });

  // Prompt 24: open an SLA-tracked ops ticket for the KYC review queue (fire-and-forget).
  if (submissionId) {
    void ticketForKyc(submissionId, userId).catch(captureException);
  }
}

/**
 * Admin-only: short-lived signed GET URL for a KYC document. Used by the Step 15
 * admin panel. Admin role is checked FIRST (never reaches storage for non-admins)
 * and every view is audit-logged (KYC PII access must be traceable).
 */
export async function getKycDocSignedUrl(
  admin: { id: string; role: Role },
  submissionId: string,
): Promise<string> {
  if (admin.role !== "ADMIN") {
    throw new KycServiceError("You do not have access to this document.");
  }
  const submission = await db.kycSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, docUrl: true, sellerId: true },
  });
  if (!submission) throw new KycServiceError("Document not found.");

  const url = await presignGet(submission.docUrl, 120);
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      action: "KYC_DOC_VIEWED",
      entity: "KycSubmission",
      entityId: submission.id,
      meta: { sellerId: submission.sellerId },
    },
  });
  return url;
}

// --- admin queue + review (Step 15) -----------------------------------------

export type KycQueueItem = {
  id: string;
  sellerId: string;
  sellerName: string;
  docType: string;
  createdAt: string;
};

/** PENDING KYC submissions, oldest first (admin review queue). */
export async function listPendingKyc(): Promise<KycQueueItem[]> {
  const rows = await db.kycSubmission.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      docType: true,
      createdAt: true,
      seller: { select: { id: true, displayName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    sellerId: r.seller.id,
    sellerName: r.seller.displayName,
    docType: r.docType,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Approve or reject a KYC submission (admin). Idempotent CAS — only a PENDING
 * submission moves — and updates the SellerProfile.kycStatus in the same
 * transaction, audit-logged. Caller is responsible for the ADMIN gate.
 */
export async function reviewKyc(
  adminId: string,
  submissionId: string,
  decision: "APPROVE" | "REJECT",
  note?: string,
): Promise<void> {
  let sellerProfileId = "";
  let sellerUserId = "";

  await db.$transaction(async (tx) => {
    const submission = await tx.kycSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, sellerId: true, seller: { select: { userId: true } } },
    });
    if (!submission) throw new KycServiceError("Submission not found.");

    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const moved = await tx.kycSubmission.updateMany({
      where: { id: submissionId, status: "PENDING" },
      data: { status, reviewedBy: adminId, reviewedAt: new Date() },
    });
    if (moved.count === 0) {
      throw new KycServiceError("This submission has already been reviewed.");
    }

    await tx.sellerProfile.update({
      where: { id: submission.sellerId },
      data: { kycStatus: status },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: decision === "APPROVE" ? "KYC_APPROVED" : "KYC_REJECTED",
        entity: "KycSubmission",
        entityId: submissionId,
        meta: { sellerId: submission.sellerId, note: note ?? null },
      },
    });

    sellerProfileId = submission.sellerId;
    sellerUserId = submission.seller.userId;
  });

  // KYC approval unlocks Gold/Platinum/Elite — recompute level immediately.
  if (sellerProfileId) {
    void recomputeSellerTrustAndLevel(sellerProfileId).catch(captureException);
    // Step 22: tell the seller their verification result.
    if (sellerUserId) {
      void notifyKycDecision(sellerUserId, decision).catch(captureException);
    }
  }
}
