import { createHmac } from "crypto";
import { captureException } from "@sentry/nextjs";
import type { KycStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { isSumsubEnabled, sumsubBaseUrl, SUMSUB_LEVEL } from "@/lib/sumsub-config";
import {
  SumsubApplicantResponseSchema,
  SumsubTokenResponseSchema,
  SumsubStatusResponseSchema,
} from "@/lib/validators/kyc-sumsub";

/**
 * Sumsub REST service (Step 29). Plain `fetch`, HMAC-SHA256 signed (same no-SDK pattern as
 * CoinGate/Razorpay). Every function guards on `isSumsubEnabled()`; with no keys the automated flow
 * is off and the manual KYC path is used instead. Money/KYC mutations stay inside DB transactions.
 */

export class KycSumsubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KycSumsubError";
  }
}

export type SumsubReviewAnswer = "GREEN" | "RED" | null;
export type SumsubReviewStatus = { reviewAnswer: SumsubReviewAnswer; rejectLabels?: string[] };

/** X-App-Access-Sig = HMAC-SHA256(ts + METHOD + path + body, SECRET) hex. */
function sign(ts: number, method: string, path: string, body: string): string {
  const secret = process.env.SUMSUB_SECRET_KEY ?? "";
  return createHmac("sha256", secret).update(`${ts}${method}${path}${body}`).digest("hex");
}

async function sumsubFetch(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  if (!appToken || !process.env.SUMSUB_SECRET_KEY) {
    throw new KycSumsubError("Sumsub is not configured.");
  }
  const payload = body !== undefined ? JSON.stringify(body) : "";
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(`${sumsubBaseUrl()}${path}`, {
    method,
    headers: {
      "X-App-Token": appToken,
      "X-App-Access-Sig": sign(ts, method, path, payload),
      "X-App-Access-Ts": String(ts),
      "Content-Type": "application/json",
    },
    ...(payload ? { body: payload } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new KycSumsubError(`Sumsub ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new KycSumsubError(`Sumsub ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * Create (or reuse) a Sumsub applicant for a seller. Idempotent: returns the stored applicantId
 * without a second API call. On first create, persists the id + flips kycStatus PENDING + audits.
 */
export async function createApplicant(userId: string, email: string, phone?: string): Promise<string> {
  if (!isSumsubEnabled()) throw new KycSumsubError("Sumsub is not configured.");

  const existing = await db.user.findUnique({ where: { id: userId }, select: { sumsubApplicantId: true } });
  if (existing?.sumsubApplicantId) return existing.sumsubApplicantId;

  const json = await sumsubFetch("POST", `/resources/applicants?levelName=${SUMSUB_LEVEL}`, {
    externalUserId: userId,
    email,
    ...(phone ? { phone } : {}),
  });
  const parsed = SumsubApplicantResponseSchema.safeParse(json);
  if (!parsed.success) throw new KycSumsubError("Unexpected createApplicant response shape.");
  const applicantId = parsed.data.id;

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { sumsubApplicantId: applicantId } });
    await tx.sellerProfile.updateMany({ where: { userId }, data: { kycStatus: "PENDING" } });
    await tx.auditLog.create({
      data: { actorId: userId, action: "SUMSUB_APPLICANT_CREATED", entity: "User", entityId: userId, meta: { applicantId } },
    });
  });
  return applicantId;
}

/** Short-lived SDK access token for the embedded flow. Caller verifies ownership of the applicant. */
export async function generateSDKToken(applicantId: string, userId: string): Promise<string> {
  if (!isSumsubEnabled()) throw new KycSumsubError("Sumsub is not configured.");
  const user = await db.user.findUnique({ where: { id: userId }, select: { sumsubApplicantId: true } });
  if (!user || user.sumsubApplicantId !== applicantId) {
    throw new KycSumsubError("Applicant does not belong to this user.");
  }
  const json = await sumsubFetch("POST", `/resources/accessTokens?userId=${applicantId}&levelName=${SUMSUB_LEVEL}`);
  const parsed = SumsubTokenResponseSchema.safeParse(json);
  if (!parsed.success) throw new KycSumsubError("Unexpected accessToken response shape.");
  return parsed.data.token;
}

/**
 * Apply a Sumsub review answer to the seller's KYC status (shared by the webhook + the poll action).
 * Idempotent + race-safe: the CAS `updateMany WHERE kycStatus != target` means a duplicate event
 * (or a webhook racing the poll) writes the AuditLog at most once. Unknown applicant → no-op.
 */
export async function applyKycReview(
  applicantId: string,
  answer: "GREEN" | "RED",
  source: "sumsub_webhook" | "sumsub_poll",
  rejectLabels?: string[],
): Promise<{ changed: boolean; status: KycStatus }> {
  const target: KycStatus = answer === "GREEN" ? "APPROVED" : "REJECTED";
  const action = answer === "GREEN" ? "KYC_APPROVED" : "KYC_REJECTED";
  return db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { sumsubApplicantId: applicantId }, select: { id: true } });
    if (!user) return { changed: false, status: "NONE" }; // unknown/deleted applicant — no-op (don't retry forever)
    const profile = await tx.sellerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, kycStatus: true },
    });
    if (!profile) return { changed: false, status: "NONE" };
    if (profile.kycStatus === target) return { changed: false, status: target }; // already there

    const moved = await tx.sellerProfile.updateMany({
      where: { id: profile.id, kycStatus: { not: target } },
      data: { kycStatus: target },
    });
    if (moved.count === 0) return { changed: false, status: target }; // lost the race — someone else applied it
    await tx.user.update({ where: { id: user.id }, data: { sumsubReviewedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action,
        entity: "SellerProfile",
        entityId: profile.id,
        meta: { source, rejectLabels: rejectLabels ?? null },
      },
    });
    return { changed: true, status: target };
  });
}

/** Current review answer for an applicant. Returns null while review is incomplete or on any error. */
export async function getApplicantStatus(applicantId: string): Promise<SumsubReviewStatus> {
  if (!isSumsubEnabled()) return { reviewAnswer: null };
  try {
    const json = await sumsubFetch("GET", `/resources/applicants/${applicantId}/requiredIdDocsStatus`);
    const parsed = SumsubStatusResponseSchema.safeParse(json);
    if (!parsed.success) return { reviewAnswer: null };
    const r = parsed.data.reviewResult ?? parsed.data.review?.reviewResult;
    return { reviewAnswer: r?.reviewAnswer ?? null, rejectLabels: r?.rejectLabels };
  } catch (err) {
    captureException(err);
    return { reviewAnswer: null };
  }
}
