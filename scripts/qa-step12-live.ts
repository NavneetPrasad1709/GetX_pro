/**
 * Step 12 LIVE R2 check — real round-trip against the configured Cloudflare R2.
 * Uses OUR presign helpers, then does the actual browser-style PUT/GET so we
 * prove: a public listing image uploads + is publicly readable; the Content-Type
 * binding fix actually blocks a spoofed type; a KYC doc lands PRIVATE (not on the
 * public domain) and is readable ONLY via a signed GET. Cleans up after.
 * Run: npx tsx scripts/qa-step12-live.ts
 */
import { readFileSync } from "fs";
// Load .env (no Prisma here to do it for us). Only set vars not already present.
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  isR2Configured,
  kycDocKey,
  listingImageKey,
  presignGet,
  presignPut,
  r2PublicUrl,
} from "../src/lib/r2";

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

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n% qa12-live test document\n");

async function main() {
  if (!isR2Configured()) {
    console.error("✗ R2 is not configured — check the R2_* vars in .env");
    process.exit(1);
  }
  console.log(`\nR2 configured → account ${process.env.R2_ACCOUNT_ID?.slice(0, 8)}…, public ${process.env.R2_PUBLIC_BUCKET}, private ${process.env.R2_PRIVATE_BUCKET}`);

  const cleanup = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });

  const publicKey = listingImageKey("_qa-live", "png");
  const privateKey = kycDocKey("_qa-live", "pdf");

  try {
    // ---- PUBLIC listing image: upload → publicly readable ----
    console.log("\n— PUBLIC bucket: listing image —");
    const putPublic = await presignPut({ scope: "public", key: publicKey, contentType: "image/png", size: PNG.length });
    const up = await fetch(putPublic, { method: "PUT", headers: { "Content-Type": "image/png" }, body: PNG });
    ok("presigned PUT uploaded the image (R2 accepted)", up.ok, `HTTP ${up.status} ${await safeText(up)}`);

    const publicUrl = r2PublicUrl(publicKey);
    const get = await fetch(publicUrl);
    ok("image is publicly readable at the public URL", get.ok, `HTTP ${get.status}`);
    ok("served as image/png", (get.headers.get("content-type") ?? "").includes("image/png"), get.headers.get("content-type") ?? "");
    const bytes = Buffer.from(await get.arrayBuffer());
    ok("downloaded bytes match what we uploaded", bytes.length === PNG.length && bytes.equals(PNG));

    // ---- Content-Type binding (the HIGH review fix) ----
    console.log("\n— security: Content-Type is bound to the signature —");
    const putSpoof = await presignPut({ scope: "public", key: listingImageKey("_qa-live", "png"), contentType: "image/png", size: PNG.length });
    const spoof = await fetch(putSpoof, { method: "PUT", headers: { "Content-Type": "text/html" }, body: PNG });
    ok("PUT with a SPOOFED Content-Type is REJECTED by R2 (403)", !spoof.ok, `expected failure, got HTTP ${spoof.status}`);

    // ---- PRIVATE KYC doc: NOT public, signed GET only ----
    console.log("\n— PRIVATE bucket: KYC doc —");
    const putPriv = await presignPut({ scope: "private", key: privateKey, contentType: "application/pdf", size: PDF.length });
    const upPriv = await fetch(putPriv, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: PDF });
    ok("presigned PUT uploaded the KYC doc to the private bucket", upPriv.ok, `HTTP ${upPriv.status} ${await safeText(upPriv)}`);

    // The public domain maps to the PUBLIC bucket → a kyc/ key must NOT be there.
    const leak = await fetch(`${process.env.R2_PUBLIC_BASE_URL}/${privateKey}`);
    ok("KYC doc is NOT reachable on the public domain", !leak.ok, `expected 4xx, got HTTP ${leak.status}`);

    const signed = await presignGet(privateKey, 120);
    const signedGet = await fetch(signed);
    ok("KYC doc IS readable via a short-lived signed GET", signedGet.ok, `HTTP ${signedGet.status}`);
    const pdfBytes = Buffer.from(await signedGet.arrayBuffer());
    ok("signed-GET bytes match", pdfBytes.equals(PDF));

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    // Best-effort cleanup of both test objects.
    await cleanup.send(new DeleteObjectCommand({ Bucket: process.env.R2_PUBLIC_BUCKET!, Key: publicKey })).catch(() => {});
    await cleanup.send(new DeleteObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET!, Key: privateKey })).catch(() => {});
  }
  if (fail > 0) process.exit(1);
}

async function safeText(r: Response): Promise<string> {
  try {
    return (await r.text()).slice(0, 200);
  } catch {
    return "";
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
