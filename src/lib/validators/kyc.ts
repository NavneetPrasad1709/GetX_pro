import { z } from "zod";

/**
 * KYC input schemas (Step 12, guardrails §6). The seller uploads an ID document
 * to the PRIVATE R2 bucket (presigned), then submits the resulting object key +
 * doc type. The service re-verifies the key belongs to that seller's prefix.
 */

export const KYC_DOC_TYPES = ["PASSPORT", "NATIONAL_ID", "DRIVING_LICENSE"] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];

export const KYC_DOC_TYPE_LABEL: Record<KycDocType, string> = {
  PASSPORT: "Passport",
  NATIONAL_ID: "National ID (Aadhaar / PAN / govt ID)",
  DRIVING_LICENSE: "Driving licence",
};

export const submitKycSchema = z.object({
  docType: z.enum(KYC_DOC_TYPES),
  // Must look exactly like a key kycDocKey() minted: kyc/<sellerId>/<32hex>.<ext>
  key: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .regex(
      /^kyc\/[a-z0-9]+\/[a-f0-9]{32}\.(jpg|png|webp|pdf)$/,
      "Invalid document reference",
    ),
});

export type SubmitKycInput = z.infer<typeof submitKycSchema>;
