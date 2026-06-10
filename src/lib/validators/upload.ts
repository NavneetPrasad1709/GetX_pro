import { z } from "zod";

/**
 * Upload validation (Step 12, guardrails §6). The presign route enforces these
 * server-side BEFORE issuing a presigned URL — wrong type / oversize never even
 * gets a URL. Kept dependency-light so the client can mirror the same limits.
 */

export const MAX_LISTING_IMAGES = 8;

/** Listing images: web-safe raster formats only. */
export const LISTING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** KYC docs: images + PDF (a scanned ID is often a PDF). */
export const KYC_DOC_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per listing image
export const MAX_KYC_BYTES = 10 * 1024 * 1024; // 10 MB per KYC doc

/** Upper bound used by the schema; per-kind caps are applied in the route. */
const ABSOLUTE_MAX_BYTES = Math.max(MAX_IMAGE_BYTES, MAX_KYC_BYTES);

export const presignSchema = z.object({
  kind: z.enum(["listing-image", "kyc-doc"]),
  contentType: z.string().trim().min(1).max(100),
  size: z.coerce
    .number()
    .int("Invalid size")
    .positive("File looks empty")
    .max(ABSOLUTE_MAX_BYTES, "File is too large"),
});

export type PresignInput = z.infer<typeof presignSchema>;

/** Per-kind allowed types + size cap. Single source for route + client copy. */
export function uploadRules(kind: PresignInput["kind"]): {
  types: readonly string[];
  maxBytes: number;
  scope: "public" | "private";
  label: string;
} {
  return kind === "listing-image"
    ? {
        types: LISTING_IMAGE_TYPES,
        maxBytes: MAX_IMAGE_BYTES,
        scope: "public",
        label: "image (JPG, PNG or WebP, up to 5 MB)",
      }
    : {
        types: KYC_DOC_TYPES,
        maxBytes: MAX_KYC_BYTES,
        scope: "private",
        label: "document (JPG, PNG, WebP or PDF, up to 10 MB)",
      };
}

export type UploadCheck =
  | { ok: true; scope: "public" | "private" }
  | { ok: false; error: string };

/**
 * The authoritative server-side type + size gate (the presign route calls this
 * BEFORE touching R2). Kept pure so the QA harness tests the exact logic the
 * route enforces. The Zod `size` cap is the absolute max; this applies the
 * tighter per-kind cap.
 */
export function checkUpload(
  kind: PresignInput["kind"],
  contentType: string,
  size: number,
): UploadCheck {
  const rules = uploadRules(kind);
  if (!rules.types.includes(contentType)) {
    return { ok: false, error: `Unsupported file type — upload an ${rules.label}.` };
  }
  if (!Number.isInteger(size) || size <= 0) {
    return { ok: false, error: "That file looks empty." };
  }
  if (size > rules.maxBytes) {
    const mb = Math.round(rules.maxBytes / (1024 * 1024));
    return { ok: false, error: `File is too large — keep it under ${mb} MB.` };
  }
  return { ok: true, scope: rules.scope };
}
