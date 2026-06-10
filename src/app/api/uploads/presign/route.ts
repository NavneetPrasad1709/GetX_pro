import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { checkUpload, presignSchema } from "@/lib/validators/upload";
import {
  extForContentType,
  isR2Configured,
  kycDocKey,
  listingImageKey,
  presignPut,
  r2PublicUrl,
} from "@/lib/r2";
import { getSellerProfileId, ListingServiceError } from "@/server/services/listings";

/**
 * Presign an upload (Step 12, guardrails §6). Auth + per-user rate limit, then
 * server-side type/size validation BEFORE issuing a presigned PUT — a wrong type
 * or oversize file never gets a URL. Only sellers upload (listing images + KYC).
 * The browser then PUTs the file straight to R2; nothing big proxies through us.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ ok: false, error: "Please log in." }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = rateLimit(`presign:${userId}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return Response.json(
      { ok: false, error: `Too many uploads. Try again in ${rl.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const parsed = presignSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { kind, contentType, size } = parsed.data;

  // Server-side type + size gate (the whole point — reject before presigning).
  const check = checkUpload(kind, contentType, size);
  if (!check.ok) {
    return Response.json({ ok: false, error: check.error }, { status: 400 });
  }

  // Only sellers upload — listing images and KYC both hang off a SellerProfile.
  let sellerId: string;
  try {
    sellerId = await getSellerProfileId(userId);
  } catch (err) {
    if (err instanceof ListingServiceError) {
      return Response.json({ ok: false, error: err.message }, { status: 403 });
    }
    throw err;
  }

  if (!isR2Configured()) {
    return Response.json(
      { ok: false, error: "Uploads aren't available right now." },
      { status: 503 },
    );
  }

  const ext = extForContentType(contentType);
  if (!ext) {
    // checkUpload already rejects unsupported types; defensive belt-and-braces.
    return Response.json({ ok: false, error: "Unsupported file type." }, { status: 400 });
  }

  try {
    if (kind === "listing-image") {
      const key = listingImageKey(sellerId, ext);
      const uploadUrl = await presignPut({ scope: "public", key, contentType, size });
      return Response.json({ ok: true, uploadUrl, key, publicUrl: r2PublicUrl(key) });
    }
    // kyc-doc → PRIVATE bucket; only the key comes back (never a public URL).
    const key = kycDocKey(sellerId, ext);
    const uploadUrl = await presignPut({ scope: "private", key, contentType, size });
    return Response.json({ ok: true, uploadUrl, key });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error("[uploads/presign]", err);
    return Response.json({ ok: false, error: "Could not start the upload." }, { status: 500 });
  }
}
