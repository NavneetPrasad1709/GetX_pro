/**
 * Prompt 22 QA harness — referral engine (fraud-safe double-sided viral loop).
 * Tests the service directly against the live dev DB: code generation, signup
 * attribution (+ referee credit), self-referral + unknown-code + already-referred
 * guards, the deferred CAS award (idempotent — exactly once), and the dashboard
 * stats. Cleans up in finally.
 * Run: npx tsx scripts/qa-referral.ts
 */
import { db } from "../src/lib/db";
import { referralConfig } from "../src/config/referral";
import {
  ensureReferralCode,
  attributeReferralAtSignup,
  checkAndAwardReferralBonus,
  getReferralStats,
} from "../src/server/services/referral";

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
const credit = async (id: string) =>
  (await db.user.findUniqueOrThrow({ where: { id }, select: { referralCreditMinor: true } }))
    .referralCreditMinor;

async function main() {
  const stamp = Date.now();
  const referrer = await db.user.create({ data: { email: `qaref-r-${stamp}@test.getx.live`, name: "QA Referrer", emailVerified: new Date(), emailNotifications: false } });
  const referee = await db.user.create({ data: { email: `qaref-e-${stamp}@test.getx.live`, name: "QA Referee", emailVerified: new Date(), emailNotifications: false } });
  const other = await db.user.create({ data: { email: `qaref-o-${stamp}@test.getx.live`, name: "QA Other", emailVerified: new Date(), emailNotifications: false } });
  const userIds = [referrer.id, referee.id, other.id];

  try {
    console.log("\n=== code generation ===");
    const code = await ensureReferralCode(referrer.id);
    ok("code is 8 chars A-Z0-9", /^[A-Z0-9]{8}$/.test(code), code);
    ok("code persisted on user", (await db.user.findUniqueOrThrow({ where: { id: referrer.id }, select: { referralCode: true } })).referralCode === code);
    ok("ensureReferralCode idempotent (same code)", (await ensureReferralCode(referrer.id)) === code);

    console.log("\n=== signup attribution ===");
    await attributeReferralAtSignup(referee.id, code);
    const ref1 = await db.referral.findUnique({ where: { refereeId: referee.id } });
    ok("PENDING referral created", ref1?.status === "PENDING" && ref1?.bonusAwarded === false);
    ok("referrer linked correctly", ref1?.referrerId === referrer.id);
    ok("referee got signup credit", (await credit(referee.id)) === referralConfig.buyer.refereeSignupMinor);
    ok("referee.referredBy set", (await db.user.findUniqueOrThrow({ where: { id: referee.id }, select: { referredBy: true } })).referredBy === code);

    console.log("\n=== guards ===");
    const creditBefore = await credit(referee.id);
    await attributeReferralAtSignup(referee.id, code); // already referred
    ok("already-referred attribution is a no-op (one referral)", (await db.referral.count({ where: { refereeId: referee.id } })) === 1);
    ok("already-referred grants no extra credit", (await credit(referee.id)) === creditBefore);

    const otherCode = await ensureReferralCode(other.id);
    await attributeReferralAtSignup(other.id, otherCode); // self-referral
    ok("self-referral creates no referral", (await db.referral.count({ where: { refereeId: other.id } })) === 0);
    ok("self-referral grants no credit", (await credit(other.id)) === 0);

    await attributeReferralAtSignup(other.id, "ZZZZ9999"); // unknown code
    ok("unknown code is a no-op", (await db.referral.count({ where: { refereeId: other.id } })) === 0);

    console.log("\n=== deferred CAS award ===");
    const referrerBefore = await credit(referrer.id);
    await checkAndAwardReferralBonus(referee.id);
    const ref2 = await db.referral.findUnique({ where: { refereeId: referee.id } });
    ok("referral → COMPLETED + bonusAwarded", ref2?.status === "COMPLETED" && ref2?.bonusAwarded === true);
    ok("referrer credited the reward", (await credit(referrer.id)) === referrerBefore + referralConfig.buyer.referrerRewardMinor);

    const afterFirst = await credit(referrer.id);
    await checkAndAwardReferralBonus(referee.id); // idempotent
    await checkAndAwardReferralBonus(referee.id);
    ok("award is idempotent (no double-credit)", (await credit(referrer.id)) === afterFirst);

    console.log("\n=== dashboard stats ===");
    const stats = await getReferralStats(referrer.id);
    ok("stats.code matches", stats.code === code);
    ok("stats.shareUrl contains ?ref=code", stats.shareUrl.includes(`?ref=${code}`));
    ok("stats.completed = 1", stats.completed === 1);
    ok("stats.earnedMinor = referrer reward", stats.earnedMinor === referralConfig.buyer.referrerRewardMinor);
    ok("history hides full email (privacy)", stats.history.every((h) => !h.refereeLabel.includes("@")));

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.referral.deleteMany({ where: { OR: [{ referrerId: { in: userIds } }, { refereeId: { in: userIds } }] } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
