/**
 * Step 32 QA — security hardening. Proves the ENV-SAFE contracts:
 *   - in-memory `rateLimit` enforces its window;
 *   - `rateLimitDistributed` falls back to in-memory when Upstash is unset
 *     (dev) and still blocks past the limit;
 *   - `buildCsp` emits a strong static policy + a nonce policy on demand;
 *   - webhook IP allowlist is open-by-default and parses the client IP;
 *   - session revocation: invalidateUserSessions / ban / role-change /
 *     password-reset each bump User.sessionVersion (so live JWTs die).
 * Creates + cleans up its own users. Run: npx tsx scripts/qa-step32.ts
 */
import { db } from "../src/lib/db";
import { rateLimit, rateLimitDistributed } from "../src/lib/rate-limit";
import { buildCsp } from "../src/lib/csp";
import { isWebhookIpAllowed, clientIpFromHeaders } from "../src/config/webhooks";
import { invalidateUserSessions, revokeUserSessions } from "../src/server/services/sessions";
import { setUserBanned, setUserRole } from "../src/server/services/admin";
import { registerUser, requestPasswordReset, resetPassword } from "../src/server/services/users";

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

const STAMP = "qa32";
const mkEmail = (tag: string) => `${STAMP}.${tag}.${process.pid}@getx.test`;

async function sv(userId: string): Promise<number> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  return u?.sessionVersion ?? -1;
}

async function main() {
  console.log("\n=== in-memory rateLimit (sync) ===");
  const k = `qa32:sync:${process.pid}`;
  let allowed = 0;
  for (let i = 0; i < 6; i++) if (rateLimit(k, { limit: 3, windowMs: 60_000 }).ok) allowed++;
  ok("allows up to the limit then blocks", allowed === 3, `allowed=${allowed}`);
  const blocked = rateLimit(k, { limit: 3, windowMs: 60_000 });
  ok("blocked result carries retryAfterSec", !blocked.ok && blocked.retryAfterSec > 0);

  console.log("\n=== rateLimitDistributed (env-safe fallback, no Upstash in dev) ===");
  ok(
    "Upstash unset in this env",
    !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN,
  );
  const dk = `qa32:dist:${process.pid}`;
  let dAllowed = 0;
  for (let i = 0; i < 5; i++) {
    const r = await rateLimitDistributed(dk, { limit: 2, windowMs: 60_000 });
    if (r.ok) dAllowed++;
  }
  ok("falls back to in-memory and still enforces the limit", dAllowed === 2, `allowed=${dAllowed}`);

  console.log("\n=== buildCsp ===");
  const staticCsp = buildCsp({ isDev: false });
  ok("static: default-src 'self'", staticCsp.includes("default-src 'self'"));
  ok("static: object-src 'none'", staticCsp.includes("object-src 'none'"));
  ok("static: frame-ancestors 'none'", staticCsp.includes("frame-ancestors 'none'"));
  ok("static: base-uri 'self'", staticCsp.includes("base-uri 'self'"));
  ok("static: form-action 'self'", staticCsp.includes("form-action 'self'"));
  ok("static: connect-src present with 'self'", /connect-src [^;]*'self'/.test(staticCsp));
  ok("static: prod adds upgrade-insecure-requests", staticCsp.includes("upgrade-insecure-requests"));
  ok("static: NO nonce / strict-dynamic", !staticCsp.includes("nonce-") && !staticCsp.includes("strict-dynamic"));

  const devCsp = buildCsp({ isDev: true });
  ok("dev: allows 'unsafe-eval' (HMR)", devCsp.includes("'unsafe-eval'"));
  ok("dev: NO upgrade-insecure-requests", !devCsp.includes("upgrade-insecure-requests"));

  const nonceCsp = buildCsp({ nonce: "TESTNONCE", isDev: false });
  ok("nonce: script-src has the nonce", nonceCsp.includes("'nonce-TESTNONCE'"));
  ok("nonce: script-src has 'strict-dynamic'", nonceCsp.includes("'strict-dynamic'"));

  console.log("\n=== webhook IP allowlist (open by default) ===");
  ok("RAZORPAY allows any IP when list empty", isWebhookIpAllowed("RAZORPAY", "203.0.113.7"));
  ok("COINGATE allows any IP when list empty", isWebhookIpAllowed("COINGATE", "203.0.113.8"));
  const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1", "x-real-ip": "8.8.8.8" });
  ok("clientIpFromHeaders takes first XFF hop", clientIpFromHeaders(h) === "9.9.9.9");
  ok("clientIpFromHeaders falls back to unknown", clientIpFromHeaders(new Headers()) === "unknown");
  // Behind Cloudflare, CF-Connecting-IP is the true provider IP, not the proxy's XFF hop.
  const cf = new Headers({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "172.16.0.1" });
  ok("clientIpFromHeaders prefers CF-Connecting-IP", clientIpFromHeaders(cf) === "203.0.113.9");

  // ---- DB-backed session revocation ----------------------------------------
  const created: string[] = [];
  try {
    console.log("\n=== invalidateUserSessions bumps sessionVersion ===");
    const u1 = await db.user.create({ data: { email: mkEmail("inval"), role: "BUYER" }, select: { id: true } });
    created.push(u1.id);
    const before = await sv(u1.id);
    await invalidateUserSessions(db, u1.id);
    ok("invalidateUserSessions +1", (await sv(u1.id)) === before + 1);
    await revokeUserSessions(u1.id);
    ok("revokeUserSessions +1", (await sv(u1.id)) === before + 2);

    console.log("\n=== ban / unban ===");
    const admin = await db.user.create({ data: { email: mkEmail("admin"), role: "ADMIN" }, select: { id: true } });
    const target = await db.user.create({ data: { email: mkEmail("target"), role: "BUYER" }, select: { id: true } });
    created.push(admin.id, target.id);
    const svBeforeBan = await sv(target.id);
    await setUserBanned(admin.id, target.id, true);
    const banned = await db.user.findUnique({ where: { id: target.id }, select: { bannedAt: true } });
    ok("ban sets bannedAt", banned?.bannedAt !== null);
    ok("ban bumps sessionVersion", (await sv(target.id)) === svBeforeBan + 1);
    const svAfterBan = await sv(target.id);
    await setUserBanned(admin.id, target.id, false);
    ok("unban clears bannedAt", (await db.user.findUnique({ where: { id: target.id }, select: { bannedAt: true } }))?.bannedAt === null);
    ok("unban does NOT bump sessionVersion", (await sv(target.id)) === svAfterBan);

    console.log("\n=== role change ===");
    const svBeforeRole = await sv(target.id);
    await setUserRole(admin.id, target.id, "ADMIN");
    ok("promote bumps sessionVersion", (await sv(target.id)) === svBeforeRole + 1);
    const svAfterRole = await sv(target.id);
    await setUserRole(admin.id, target.id, "ADMIN"); // same role → early return
    ok("same-role change does NOT bump", (await sv(target.id)) === svAfterRole);

    console.log("\n=== password reset ===");
    const email = mkEmail("reset");
    const reg = await registerUser({ name: "QA Reset", email, password: "GetxTest123!" });
    created.push(reg.userId);
    const svBeforeReset = await sv(reg.userId);
    const { resetUrl } = await requestPasswordReset(email);
    ok("reset URL minted for a password account", !!resetUrl);
    const token = resetUrl ? new URL(resetUrl).searchParams.get("token") : null;
    ok("token present in reset URL", !!token);
    if (token) {
      await resetPassword({ email, token, password: "GetxTest456!" });
      ok("password reset bumps sessionVersion", (await sv(reg.userId)) === svBeforeReset + 1);
    }
  } finally {
    if (created.length) {
      await db.verificationToken.deleteMany({ where: { identifier: { contains: STAMP } } }).catch(() => {});
      await db.auditLog.deleteMany({ where: { entityId: { in: created } } }).catch(() => {});
      await db.user.deleteMany({ where: { id: { in: created } } }).catch(() => {});
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 32 QA — ${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
