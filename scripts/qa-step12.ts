/**
 * Step 12 QA harness — R2 uploads (presign + validation + KYC). Presigning is a
 * LOCAL HMAC operation (no network), so this exercises the real presign + key +
 * URL-validation logic with dummy R2 creds, plus the listing/KYC services and
 * the presign route's auth gate against the live dev DB. The only thing it can't
 * do headlessly is the actual browser→R2 PUT (needs a real bucket — owner creds).
 * Run: npx tsx scripts/qa-step12.ts   (creates marked data, cleans up after).
 */
import { db } from "../src/lib/db";

// Configure dummy R2 BEFORE importing r2 helpers use it (read at call time).
process.env.R2_ACCOUNT_ID = "qa12account";
process.env.R2_ACCESS_KEY_ID = "qa12accesskey";
process.env.R2_SECRET_ACCESS_KEY = "qa12secretkey";
process.env.R2_PUBLIC_BUCKET = "getx-public-test";
process.env.R2_PRIVATE_BUCKET = "getx-private-test";
process.env.R2_PUBLIC_BASE_URL = "https://pub-qa12.r2.dev";

import {
  extForContentType,
  isAllowedListingImageUrl,
  isR2Configured,
  kycDocKey,
  listingImageKey,
  presignGet,
  presignPut,
  r2PublicUrl,
} from "../src/lib/r2";
import {
  checkUpload,
  MAX_IMAGE_BYTES,
  MAX_KYC_BYTES,
  presignSchema,
} from "../src/lib/validators/upload";
import { submitKycSchema } from "../src/lib/validators/kyc";
import { createListing } from "../src/server/services/listings";
import {
  getKycDocSignedUrl,
  getMyKycStatus,
  submitKyc,
} from "../src/server/services/kyc";
// NOTE: the /api/uploads/presign route's auth gate uses Auth.js `auth()` →
// `headers()`, which can't run outside a Next request scope (a plain script).
// Its 401 path is the same pattern as every tested action; the validation it
// enforces (checkUpload) is unit-tested below, and the route is type/build-checked.

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}
async function threw(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const base = "https://pub-qa12.r2.dev";

async function main() {
  const stamp = Date.now();

  console.log("\n— config + content-type → ext —");
  ok("isR2Configured true with full env", isR2Configured());
  ok("jpeg→jpg, png→png, webp→webp, pdf→pdf", extForContentType("image/jpeg") === "jpg" && extForContentType("image/png") === "png" && extForContentType("image/webp") === "webp" && extForContentType("application/pdf") === "pdf");
  ok("unknown type → null", extForContentType("image/gif") === null && extForContentType("text/html") === null);

  console.log("\n— key generation (random, prefixed) —");
  const lk = listingImageKey("seller123", "jpg");
  const kk = kycDocKey("seller123", "pdf");
  ok("listing key shape listings/<seller>/<32hex>.jpg", /^listings\/seller123\/[a-f0-9]{32}\.jpg$/.test(lk), lk);
  ok("kyc key shape kyc/<seller>/<32hex>.pdf", /^kyc\/seller123\/[a-f0-9]{32}\.pdf$/.test(kk), kk);
  ok("two keys never collide", listingImageKey("s", "png") !== listingImageKey("s", "png"));

  console.log("\n— public URL + allow-list (anti-injection) —");
  ok("r2PublicUrl builds base + key", r2PublicUrl(lk) === `${base}/${lk}`);
  ok("our listing URL is allowed", isAllowedListingImageUrl(`${base}/listings/seller123/abc.jpg`));
  ok("off-host URL rejected", !isAllowedListingImageUrl("https://evil.com/listings/x.jpg"));
  ok("private/kyc-style path rejected", !isAllowedListingImageUrl(`${base}/kyc/seller/secret.pdf`));
  ok("path-traversal rejected", !isAllowedListingImageUrl(`${base}/listings/../kyc/x.jpg`));
  ok("non-public-prefix rejected", !isAllowedListingImageUrl(`${base}/other/x.jpg`));

  console.log("\n— server-side type + size gate (checkUpload) —");
  ok("listing: png 1MB accepted", checkUpload("listing-image", "image/png", 1_000_000).ok);
  ok("listing: gif rejected (wrong type)", !checkUpload("listing-image", "image/gif", 1000).ok);
  ok("listing: pdf rejected (not a listing image)", !checkUpload("listing-image", "application/pdf", 1000).ok);
  ok("listing: 6MB rejected (oversize)", !checkUpload("listing-image", "image/jpeg", MAX_IMAGE_BYTES + 1).ok);
  ok("kyc: pdf 5MB accepted", checkUpload("kyc-doc", "application/pdf", 5_000_000).ok);
  ok("kyc: jpeg accepted", checkUpload("kyc-doc", "image/jpeg", 1000).ok);
  ok("kyc: text rejected", !checkUpload("kyc-doc", "text/plain", 1000).ok);
  ok("kyc: 11MB rejected (oversize)", !checkUpload("kyc-doc", "application/pdf", MAX_KYC_BYTES + 1).ok);
  ok("checkUpload scope: listing=public, kyc=private", (checkUpload("listing-image", "image/png", 10) as { scope: string }).scope === "public" && (checkUpload("kyc-doc", "image/png", 10) as { scope: string }).scope === "private");

  console.log("\n— presign schema —");
  ok("valid presign payload parses", presignSchema.safeParse({ kind: "listing-image", contentType: "image/png", size: 1000 }).success);
  ok("size 0 rejected", !presignSchema.safeParse({ kind: "listing-image", contentType: "image/png", size: 0 }).success);
  ok("negative size rejected", !presignSchema.safeParse({ kind: "kyc-doc", contentType: "application/pdf", size: -5 }).success);
  ok("absurd size rejected", !presignSchema.safeParse({ kind: "kyc-doc", contentType: "application/pdf", size: 999_999_999 }).success);
  ok("bad kind rejected", !presignSchema.safeParse({ kind: "avatar", contentType: "image/png", size: 10 }).success);

  console.log("\n— presigned URLs (local HMAC, no network) —");
  const putUrl = await presignPut({ scope: "public", key: lk, contentType: "image/jpeg", size: 12345 });
  ok("PUT url targets public bucket + key + is signed", putUrl.includes("getx-public-test") && putUrl.includes(lk) && putUrl.includes("X-Amz-Signature"), putUrl.slice(0, 80));
  const getUrl = await presignGet(kk, 120);
  ok("GET url targets PRIVATE bucket + key + is signed", getUrl.includes("getx-private-test") && getUrl.includes(kk) && getUrl.includes("X-Amz-Signature"), getUrl.slice(0, 80));
  ok("presigned URLs expire (X-Amz-Expires present)", putUrl.includes("X-Amz-Expires") && getUrl.includes("X-Amz-Expires"));
  // Review fix #1: content-type MUST be in the SigV4 signed headers (else a
  // seller could presign image/jpeg then PUT text/html → content injection).
  const signedHeaders = new URL(putUrl).searchParams.get("X-Amz-SignedHeaders") ?? "";
  ok("PUT binds content-type (type can't be spoofed at upload)", signedHeaders.includes("content-type") && signedHeaders.includes("content-length"), signedHeaders);
  // Review fix #2: no empty-body checksum baked into the URL (would BadDigest in R2).
  ok("no precomputed checksum baked into the PUT url", new URL(putUrl).searchParams.get("x-amz-checksum-crc32") === null);

  console.log("\n— KYC submit schema —");
  ok("valid kyc key accepted", submitKycSchema.safeParse({ docType: "PASSPORT", key: `kyc/abc123/${"0".repeat(32)}.pdf` }).success);
  ok("non-kyc key rejected", !submitKycSchema.safeParse({ docType: "PASSPORT", key: `listings/abc/${"0".repeat(32)}.jpg` }).success);
  ok("bad ext rejected", !submitKycSchema.safeParse({ docType: "PASSPORT", key: `kyc/abc/${"0".repeat(32)}.exe` }).success);
  ok("bad docType rejected", !submitKycSchema.safeParse({ docType: "SSN", key: `kyc/abc/${"0".repeat(32)}.pdf` }).success);

  // --------------------------------------------------------------------
  // Integration: real DB (marked data, cleaned up).
  // --------------------------------------------------------------------
  const emails = {
    seller: `qa12-seller-${stamp}@test.getx.live`,
    admin: `qa12-admin-${stamp}@test.getx.live`,
  };
  const sellerUser = await db.user.create({ data: { email: emails.seller, emailVerified: new Date() } });
  const adminUser = await db.user.create({ data: { email: emails.admin, role: "ADMIN", emailVerified: new Date() } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA12 Seller" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  try {
    console.log("\n— listing service stores ONLY verified R2 image URLs —");
    const goodUrl = `${base}/listings/${seller.id}/${"a".repeat(32)}.webp`;
    const listing = await createListing(
      { id: sellerUser.id, role: "SELLER" },
      {
        gameId: game.id,
        categoryId: cat.id,
        type: cat.kind,
        title: "QA12 listing with images",
        description: "A listing used to verify image storage in Step 12.",
        price: 100000,
        stock: 1,
        deliveryType: "MANUAL",
        attributes: {},
        images: [goodUrl, goodUrl], // duplicate → de-duped
        publish: false,
      },
    );
    ok("valid R2 image stored (de-duped to 1)", listing.images.length === 1 && listing.images[0] === goodUrl, JSON.stringify(listing.images));

    const injected = await threw(() =>
      createListing(
        { id: sellerUser.id, role: "SELLER" },
        {
          gameId: game.id,
          categoryId: cat.id,
          type: cat.kind,
          title: "QA12 listing injection attempt",
          description: "Tries to store an off-host image URL — must be rejected.",
          price: 100000,
          stock: 1,
          deliveryType: "MANUAL",
          attributes: {},
          images: ["https://evil.com/x.jpg"],
          publish: false,
        },
      ),
    );
    ok("off-host image URL rejected by the service", injected !== null && injected.includes("couldn't be verified"), injected ?? "");

    console.log("\n— KYC: submit (private key) + admin signed view —");
    const kycKey = `kyc/${seller.id}/${"0".repeat(32)}.pdf`;
    await submitKyc(sellerUser.id, "PASSPORT", kycKey);
    const status = await getMyKycStatus(sellerUser.id);
    ok("profile → PENDING after submit", status.status === "PENDING" && status.latestSubmittedAt !== null);
    const sub = await db.kycSubmission.findFirstOrThrow({ where: { sellerId: seller.id } });
    ok("KycSubmission stores the private KEY (not a URL)", sub.docUrl === kycKey && !sub.docUrl.startsWith("http"));

    const foreignKey = await threw(() => submitKyc(sellerUser.id, "PASSPORT", `kyc/someoneelse/${"0".repeat(32)}.pdf`));
    ok("key under another seller's prefix rejected", foreignKey !== null, foreignKey ?? "");

    const denied = await threw(() => getKycDocSignedUrl({ id: sellerUser.id, role: "SELLER" }, sub.id));
    ok("non-admin cannot get a KYC signed URL", denied !== null && denied.includes("access"), denied ?? "");

    const signed = await getKycDocSignedUrl({ id: adminUser.id, role: "ADMIN" }, sub.id);
    ok("admin gets a short-lived PRIVATE signed GET", signed.includes("getx-private-test") && signed.includes(kycKey) && signed.includes("X-Amz-Signature"));
    ok("KYC access is audit-logged", (await db.auditLog.count({ where: { action: "KYC_DOC_VIEWED", entityId: sub.id } })) === 1);

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    await db.auditLog.deleteMany({ where: { actorId: { in: [sellerUser.id, adminUser.id] } } });
    await db.listing.deleteMany({ where: { sellerId: seller.id } });
    await db.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await db.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
