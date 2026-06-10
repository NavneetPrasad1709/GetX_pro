import { randomBytes } from "crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 (S3-compatible) storage helper (Step 12, guardrails §6).
 *
 *   • PUBLIC bucket  → listing images. Long-lived public URLs (R2_PUBLIC_BASE_URL),
 *     served by R2's public domain; rendered via next/image.
 *   • PRIVATE bucket → KYC docs / IDs. NO public access — read ONLY through
 *     short-lived presigned GET URLs, restricted to admins (Step 15).
 *
 * Uploads go DIRECT browser → R2 via presigned PUT URLs (big files never proxy
 * through Next). The presign route validates type + size server-side first, and
 * we sign ContentType + ContentLength so R2 rejects anything else.
 *
 * Env-safe: with R2 unconfigured, isR2Configured() is false and callers return a
 * clean 503 instead of crashing (same pattern as Sentry/Turnstile empty config).
 */

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
  publicBaseUrl: string; // normalized: no trailing slash
};

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBucket = process.env.R2_PUBLIC_BUCKET;
  const privateBucket = process.env.R2_PRIVATE_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBucket ||
    !privateBucket ||
    !publicBaseUrl
  ) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    publicBucket,
    privateBucket,
    publicBaseUrl,
  };
}

export function isR2Configured(): boolean {
  return readConfig() !== null;
}

export class R2NotConfiguredError extends Error {
  constructor() {
    super("File storage is not configured.");
    this.name = "R2NotConfiguredError";
  }
}

let cached: { client: S3Client; config: R2Config } | null = null;
function getClient(): { client: S3Client; config: R2Config } {
  const config = readConfig();
  if (!config) throw new R2NotConfiguredError();
  if (cached && cached.config.accountId === config.accountId) return cached;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // The SDK default ("WHEN_SUPPORTED") bakes an EMPTY-body CRC32 checksum into
    // the presigned URL; the browser then PUTs the real body → R2 can reject it
    // as a checksum mismatch (BadDigest), breaking every upload. R2 doesn't need
    // the SDK's request checksum, so only add it when a command truly requires it.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  cached = { client, config };
  return cached;
}

// --- content types / keys ---------------------------------------------------

export type UploadScope = "public" | "private";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Safe file extension for a validated content-type (null = unsupported). */
export function extForContentType(contentType: string): string | null {
  return EXT_BY_TYPE[contentType] ?? null;
}

/** Random, unguessable object key for a listing image (public bucket). */
export function listingImageKey(sellerId: string, ext: string): string {
  return `listings/${sellerId}/${randomBytes(16).toString("hex")}.${ext}`;
}

/** Random, unguessable object key for a KYC document (private bucket). */
export function kycDocKey(sellerId: string, ext: string): string {
  return `kyc/${sellerId}/${randomBytes(16).toString("hex")}.${ext}`;
}

/** Public URL for a public-bucket key (for storing on the listing + rendering). */
export function r2PublicUrl(key: string): string {
  const config = readConfig();
  if (!config) throw new R2NotConfiguredError();
  return `${config.publicBaseUrl}/${key}`;
}

/**
 * Is `url` a public URL WE issued for a listing image? The listing service runs
 * this before storing client-supplied image URLs — so a client can never park an
 * arbitrary off-host URL on a listing (next/image SSRF / content injection).
 */
export function isAllowedListingImageUrl(url: string): boolean {
  const config = readConfig();
  if (!config) return false;
  if (url.length > 2048 || url.includes("..")) return false;
  return url.startsWith(`${config.publicBaseUrl}/listings/`);
}

// --- presigning -------------------------------------------------------------

/**
 * Presigned PUT for a DIRECT browser upload. We force BOTH content-type and
 * content-length into the SigV4 signed headers, so R2 refuses a body of any
 * other type or size than the one the server validated. (SigV4 only enforces
 * headers listed in X-Amz-SignedHeaders; without `signableHeaders` the SDK signs
 * only content-length + host, leaving the type spoofable — e.g. a seller could
 * presign image/jpeg then PUT text/html and host scriptable content on our R2
 * public domain. Binding content-type closes that.)
 */
export async function presignPut(args: {
  scope: UploadScope;
  key: string;
  contentType: string;
  size: number;
  ttlSeconds?: number;
}): Promise<string> {
  const { client, config } = getClient();
  const bucket =
    args.scope === "public" ? config.publicBucket : config.privateBucket;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.size,
  });
  return getSignedUrl(client, command, {
    expiresIn: args.ttlSeconds ?? 300,
    signableHeaders: new Set(["content-type", "content-length", "host"]),
  });
}

/**
 * Short-lived presigned GET for a PRIVATE object — the ONLY way KYC docs are
 * ever read (admins only, Step 15). Default 120s so a leaked URL dies fast.
 */
export async function presignGet(key: string, ttlSeconds = 120): Promise<string> {
  const { client, config } = getClient();
  const command = new GetObjectCommand({ Bucket: config.privateBucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
}

/** Best-effort delete of a PUBLIC object (image removed / orphan cleanup). */
export async function deletePublicObject(key: string): Promise<void> {
  const { client, config } = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: config.publicBucket, Key: key }),
  );
}
