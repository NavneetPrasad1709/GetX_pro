/**
 * Step 29 QA — Sumsub KYC. The webhook logic is fully testable with a TEST secret set in-process
 * (the handler reads process.env directly + computes real HMAC). Covers: valid GREEN→APPROVED,
 * duplicate (idempotent, one audit), RED→REJECTED, bad/missing signature → 401, unknown type → 200
 * no-op, malformed body → 400, createApplicant idempotency, and the no-keys fallback. Real Sumsub
 * HTTP (createApplicant/token/status) is dormant without keys — guarded. Cleans up in finally.
 * Run: npx tsx scripts/qa-step29.ts
 */
import { createHmac } from "crypto";
import { db } from "../src/lib/db";
import { POST as sumsubWebhook } from "../src/app/api/webhooks/sumsub/route";
import { createApplicant } from "../src/server/services/kyc-sumsub";
import { isSumsubEnabled } from "../src/lib/sumsub-config";

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
async function threw(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

const SECRET = "qa29-secret";
function post(payload: object, opts: { sign?: boolean | string } = { sign: true }) {
  const raw = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.sign === true) headers["x-payload-digest"] = createHmac("sha256", SECRET).update(raw).digest("hex");
  else if (typeof opts.sign === "string") headers["x-payload-digest"] = opts.sign;
  return sumsubWebhook(new Request("http://localhost/api/webhooks/sumsub", { method: "POST", body: raw, headers }));
}

async function main() {
  const stamp = Date.now();
  const savedToken = process.env.SUMSUB_APP_TOKEN;
  const savedSecret = process.env.SUMSUB_SECRET_KEY;
  process.env.SUMSUB_APP_TOKEN = "qa29-token";
  process.env.SUMSUB_SECRET_KEY = SECRET;

  const applicant1 = `qa29-app-green-${stamp}`;
  const applicant2 = `qa29-app-red-${stamp}`;
  const u1 = await db.user.create({ data: { email: `qa29-1-${stamp}@test.getx.live`, name: "QA29 Green", emailVerified: new Date(), emailNotifications: false, sumsubApplicantId: applicant1 } });
  const u2 = await db.user.create({ data: { email: `qa29-2-${stamp}@test.getx.live`, name: "QA29 Red", emailVerified: new Date(), emailNotifications: false, sumsubApplicantId: applicant2 } });
  const s1 = await db.sellerProfile.create({ data: { userId: u1.id, displayName: "QA29 G", kycStatus: "NONE" } });
  const s2 = await db.sellerProfile.create({ data: { userId: u2.id, displayName: "QA29 R", kycStatus: "NONE" } });

  try {
    console.log("\n=== webhook signature (fail-closed) ===");
    ok("missing x-payload-digest → 401", (await post({ type: "applicantReviewed", applicantId: applicant1, createdAt: "t" }, { sign: false })).status === 401);
    ok("wrong digest → 401", (await post({ type: "applicantReviewed", applicantId: applicant1, createdAt: "t" }, { sign: "deadbeef" })).status === 401);

    console.log("\n=== GREEN → APPROVED ===");
    const green = { type: "applicantReviewed", applicantId: applicant1, createdAt: `${stamp}`, reviewResult: { reviewAnswer: "GREEN" } };
    const r1 = await post(green);
    ok("valid GREEN signature → 200", r1.status === 200);
    ok("kycStatus → APPROVED", (await db.sellerProfile.findUniqueOrThrow({ where: { id: s1.id } })).kycStatus === "APPROVED");
    ok("AuditLog KYC_APPROVED + source sumsub_webhook", (await db.auditLog.count({ where: { action: "KYC_APPROVED", entityId: s1.id } })) === 1);

    console.log("\n=== duplicate GREEN (idempotent) ===");
    const r2 = await post(green);
    ok("duplicate → 200", r2.status === 200);
    ok("still APPROVED, no status flip", (await db.sellerProfile.findUniqueOrThrow({ where: { id: s1.id } })).kycStatus === "APPROVED");
    ok("AuditLog count still 1 (state guard dedupe)", (await db.auditLog.count({ where: { action: "KYC_APPROVED", entityId: s1.id } })) === 1);

    console.log("\n=== RED → REJECTED ===");
    const red = { type: "applicantReviewed", applicantId: applicant2, createdAt: `${stamp}`, reviewResult: { reviewAnswer: "RED", rejectLabels: ["FORGERY"] } };
    ok("valid RED → 200", (await post(red)).status === 200);
    ok("kycStatus → REJECTED", (await db.sellerProfile.findUniqueOrThrow({ where: { id: s2.id } })).kycStatus === "REJECTED");
    ok("AuditLog KYC_REJECTED written", (await db.auditLog.count({ where: { action: "KYC_REJECTED", entityId: s2.id } })) === 1);

    console.log("\n=== other event types + bad body ===");
    const beforeStatus = (await db.sellerProfile.findUniqueOrThrow({ where: { id: s1.id } })).kycStatus;
    ok("unknown type (applicantCreated) → 200 no-op", (await post({ type: "applicantCreated", applicantId: applicant1, createdAt: "t" })).status === 200);
    ok("status unchanged after unknown type", (await db.sellerProfile.findUniqueOrThrow({ where: { id: s1.id } })).kycStatus === beforeStatus);
    ok("malformed body (missing applicantId) → 400", (await post({ type: "applicantReviewed", createdAt: "t" })).status === 400);

    console.log("\n=== createApplicant idempotency + no-keys fallback ===");
    ok("createApplicant returns existing id without a Sumsub call", (await createApplicant(u1.id, u1.email)) === applicant1);
    ok("isSumsubEnabled true with keys", isSumsubEnabled() === true);

    delete process.env.SUMSUB_APP_TOKEN;
    delete process.env.SUMSUB_SECRET_KEY;
    ok("isSumsubEnabled false without keys", isSumsubEnabled() === false);
    ok("createApplicant throws when disabled", await threw(() => createApplicant(u1.id, u1.email)));
    ok("webhook returns 401 when SUMSUB_SECRET_KEY absent", (await post(green, { sign: false })).status === 401);
  } finally {
    if (savedToken === undefined) delete process.env.SUMSUB_APP_TOKEN; else process.env.SUMSUB_APP_TOKEN = savedToken;
    if (savedSecret === undefined) delete process.env.SUMSUB_SECRET_KEY; else process.env.SUMSUB_SECRET_KEY = savedSecret;
    await db.auditLog.deleteMany({ where: { entityId: { in: [s1.id, s2.id, u1.id, u2.id] } } });
    await db.sellerProfile.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
    await db.user.deleteMany({ where: { id: { in: [u1.id, u2.id] } } });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 29 QA — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
