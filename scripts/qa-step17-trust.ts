/**
 * Step 17 VERIFICATION — Live Trust Score (built via audit Prompt-11). No new feature code; this
 * proves the existing trust-score.ts is correct: the pure formula (computeTrustScore /
 * computeRiskScore / resolveSellerLevel incl. KYC + dispute-rate gates + clamping) and the
 * DB recompute (recomputeSellerTrustAndLevel writes score + level + risk + breakdown, broadcast
 * fails gracefully when the socket server is down). Cleans up in finally.
 * Run: npx tsx scripts/qa-step17-trust.ts
 */
import { db } from "../src/lib/db";
import {
  computeTrustScore,
  computeRiskScore,
  resolveSellerLevel,
  recomputeSellerTrustAndLevel,
  SELLER_LEVELS,
} from "../src/server/services/trust-score";

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

async function main() {
  const stamp = Date.now();
  let userId = "";
  let sellerId = "";
  let buyerId = "";
  let convoId = "";

  try {
    console.log("\n=== seller levels config ===");
    ok("5 levels BRONZE→ELITE in ascending order", SELLER_LEVELS.map((l) => l.id).join(",") === "BRONZE,SILVER,GOLD,PLATINUM,ELITE");
    ok("Elite gives the deepest commission discount", SELLER_LEVELS[4].perks.commissionDiscountPct === 5);
    ok("Bronze requires no KYC, Gold+ requires KYC", SELLER_LEVELS[0].requiresKyc === false && SELLER_LEVELS[2].requiresKyc === true);

    console.log("\n=== computeTrustScore (pure) ===");
    const strong = computeTrustScore({ completedOrders: 50, cancelledOrders: 0, disputedOrders: 0, ratingAvg: 4.8, ratingCount: 30, avgFirstReplyMinutes: 20, accountAgeDays: 200, kycStatus: "APPROVED" });
    ok("strong seller scores 94 (30+24+20+10+10)", strong.total === 94, `got ${strong.total}`);
    ok("breakdown sums to total", strong.breakdown.completionRate + strong.breakdown.ratingScore + strong.breakdown.responseTime + strong.breakdown.accountAge + strong.breakdown.kycVerified + strong.breakdown.disputePenalty === strong.total);

    const fresh = computeTrustScore({ completedOrders: 0, cancelledOrders: 0, disputedOrders: 0, ratingAvg: 0, ratingCount: 0, avgFirstReplyMinutes: null, accountAgeDays: 1, kycStatus: "NONE" });
    ok("new seller uses neutral defaults → 38 (15+12+10+1)", fresh.total === 38, `got ${fresh.total}`);

    const disputed = computeTrustScore({ completedOrders: 10, cancelledOrders: 0, disputedOrders: 5, ratingAvg: 0, ratingCount: 0, avgFirstReplyMinutes: null, accountAgeDays: 1, kycStatus: "NONE" });
    ok("high dispute rate applies -15 penalty → 28", disputed.total === 28, `got ${disputed.total}`);

    const clamped = computeTrustScore({ completedOrders: 999, cancelledOrders: 0, disputedOrders: 0, ratingAvg: 5, ratingCount: 999, avgFirstReplyMinutes: 1, accountAgeDays: 9999, kycStatus: "APPROVED" });
    ok("score clamps to ≤100", clamped.total <= 100 && clamped.total === 95, `got ${clamped.total}`);

    console.log("\n=== resolveSellerLevel (gates) ===");
    ok("94 / 200 sales / APPROVED / 0% → ELITE", resolveSellerLevel(94, 200, "APPROVED", 0) === "ELITE");
    ok("KYC gate: same score but no KYC → SILVER (Gold+ need KYC)", resolveSellerLevel(94, 200, "NONE", 0) === "SILVER");
    ok("low score → BRONZE", resolveSellerLevel(40, 0, "NONE", 0) === "BRONZE");
    ok("70 / 30 / APPROVED / 12% → GOLD", resolveSellerLevel(70, 30, "APPROVED", 12) === "GOLD");
    ok("dispute gate: 18% > Gold's 15% cap → falls to SILVER", resolveSellerLevel(70, 30, "APPROVED", 18) === "SILVER");

    console.log("\n=== computeRiskScore (pure) ===");
    ok("risky new seller (disputes+young+noKYC+lowCompletion) → 100", computeRiskScore({ disputedOrders: 5, closedOrders: 10, accountAgeDays: 3, kycStatus: "NONE", completionRate: 0.4 }) === 100);
    ok("clean veteran → 0 risk", computeRiskScore({ disputedOrders: 0, closedOrders: 50, accountAgeDays: 200, kycStatus: "APPROVED", completionRate: 1 }) === 0);

    console.log("\n=== recomputeSellerTrustAndLevel (DB write + graceful broadcast) ===");
    const user = await db.user.create({
      data: { email: `qa17-s-${stamp}@test.getx.live`, name: "QA17 Seller", emailVerified: new Date(), emailNotifications: false, createdAt: new Date(Date.now() - 210 * 86_400_000) },
    });
    userId = user.id;
    const seller = await db.sellerProfile.create({
      data: { userId: user.id, displayName: "QA17 Store", kycStatus: "APPROVED", ratingAvg: 4.9, ratingCount: 25, totalSales: 200 },
    });
    sellerId = seller.id;

    await recomputeSellerTrustAndLevel(seller.id); // broadcast will fail (socket down) but must not throw
    const after = await db.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } });
    ok("recompute wrote a trust score in range (≈70)", after.trustScore >= 65 && after.trustScore <= 75, `got ${after.trustScore}`);
    ok("recompute resolved level GOLD (trust≥65, 200 sales, KYC)", after.sellerLevel === "GOLD", `got ${after.sellerLevel}`);
    ok("recompute wrote riskScore 0 (clean seller)", after.riskScore === 0, `got ${after.riskScore}`);
    ok("recompute stamped trustScoreUpdatedAt", after.trustScoreUpdatedAt !== null);
    ok("recompute persisted the breakdown JSON", after.trustScoreBreakdown !== null && typeof after.trustScoreBreakdown === "object");
    ok("recompute did NOT throw despite socket server being down", true);
    const bd0 = after.trustScoreBreakdown as Record<string, number>;
    ok("no conversations → responseTime neutral default (10)", bd0.responseTime === 10, `got ${bd0.responseTime}`);

    console.log("\n=== reply-time SQL computes correctly (the fixed query) ===");
    const buyer = await db.user.create({
      data: { email: `qa17-b-${stamp}@test.getx.live`, name: "QA17 Buyer", emailVerified: new Date(), emailNotifications: false },
    });
    buyerId = buyer.id;
    const convStart = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const convo = await db.conversation.create({
      data: { buyerId: buyer.id, sellerId: seller.id, createdAt: convStart },
    });
    convoId = convo.id;
    // Seller replies 10 minutes after the conversation starts → responseTime should bump to 20.
    await db.message.create({
      data: { conversationId: convo.id, senderId: user.id, body: "Hi, how can I help?", createdAt: new Date(convStart.getTime() + 10 * 60 * 1000) },
    });
    await recomputeSellerTrustAndLevel(seller.id);
    const after2 = await db.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } });
    const bd1 = after2.trustScoreBreakdown as Record<string, number>;
    ok("10-min seller reply → responseTime = 20 (fixed SQL averages correctly)", bd1.responseTime === 20, `got ${bd1.responseTime}`);
  } finally {
    if (convoId) await db.message.deleteMany({ where: { conversationId: convoId } });
    if (convoId) await db.conversation.deleteMany({ where: { id: convoId } });
    if (sellerId) await db.sellerProfile.deleteMany({ where: { id: sellerId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    if (buyerId) await db.user.deleteMany({ where: { id: buyerId } });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 17 verification — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
