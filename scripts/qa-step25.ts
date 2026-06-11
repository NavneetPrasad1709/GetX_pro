/**
 * Step 25 QA — AI Dispute Judge. Drives the REAL pipeline against the dev DB with
 * a deterministic verdict injected via the test seam (setJudgeModelOverride), so
 * the full flow — context load → persist → confidence gate → escrow resolution →
 * pgvector store/retrieve → admin accept/override — is exercised without a live
 * ANTHROPIC_API_KEY. Test (k) proves the no-key throw. Cleans up in finally.
 * Run: npx tsx scripts/qa-step25.ts
 */
import { db } from "../src/lib/db";
import { createOrder } from "../src/server/services/orders";
import { applyPaymentEvent } from "../src/server/services/payments";
import { markDelivered, openDispute } from "../src/server/services/escrow";
import { getWalletBalances } from "../src/server/services/wallet";
import { embedText, EMBEDDING_DIM } from "../src/lib/embeddings";
import {
  judgeDispute,
  findSimilarCases,
  acceptAiVerdict,
  overrideAiVerdict,
  setJudgeModelOverride,
  type JudgeOutput,
} from "../src/server/services/dispute-judge";

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

const stamp = Date.now();
const verdict = (v: "BUYER" | "SELLER", confidence: number): JudgeOutput => ({
  verdict: v,
  confidence,
  reasoning: `test verdict ${v} @ ${confidence}`,
  keyFacts: ["delivery proof reviewed", "chat reviewed"],
});

function resetAiCache() {
  (globalThis as unknown as { anthropic?: unknown }).anthropic = undefined;
}

async function main() {
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const orderIds: string[] = [];
  const disputeIds: string[] = [];
  let sellerWalletId = "";

  const buyerUser = await db.user.create({ data: { email: `qa25.buyer.${stamp}@getx.test`, emailVerified: new Date() }, select: { id: true } });
  const sellerUser = await db.user.create({ data: { email: `qa25.seller.${stamp}@getx.test`, emailVerified: new Date() }, select: { id: true } });
  const adminUser = await db.user.create({ data: { email: `qa25.admin.${stamp}@getx.test`, role: "ADMIN" }, select: { id: true } });
  userIds.push(buyerUser.id, sellerUser.id, adminUser.id);
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA25 Seller" }, select: { id: true } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];
  const buyerSession = { id: buyerUser.id, role: "BUYER" as const };

  async function mkDisputedOrder(slug: string) {
    const listing = await db.listing.create({
      data: {
        sellerId: seller.id, gameId: game.id, categoryId: cat.id, type: cat.kind,
        title: `QA25 ${slug}`, slug, description: "QA25 dispute listing",
        priceMinor: 100000, currency: "INR", stock: 1, deliveryType: "MANUAL",
        status: "ACTIVE", attributes: {},
      },
      select: { id: true },
    });
    listingIds.push(listing.id);
    const order = await createOrder(buyerSession, { listingSlug: slug, qty: 1 });
    orderIds.push(order.id);
    const ref = `qa25-ref-${slug}`;
    await db.payment.create({ data: { orderId: order.id, provider: "RAZORPAY", providerRef: ref, amountMinor: order.totalMinor, currency: "INR", status: "PENDING" } });
    const res = await applyPaymentEvent({ provider: "RAZORPAY", providerEventId: `qa25-evt-${slug}`, providerRef: ref, kind: "CONFIRMED", amountMinor: order.totalMinor, currency: "INR", raw: {} });
    if (res.outcome !== "applied") throw new Error(`setup pay failed: ${JSON.stringify(res)}`);
    await markDelivered(sellerUser.id, order.id, "account: user/pass delivered here");
    await openDispute(buyerUser.id, order.id, "item not as described");
    const dispute = await db.dispute.findUniqueOrThrow({ where: { orderId: order.id }, select: { id: true } });
    disputeIds.push(dispute.id);
    const wallet = await db.wallet.findUniqueOrThrow({ where: { sellerProfileId: seller.id }, select: { id: true } });
    sellerWalletId = wallet.id;
    return { orderId: order.id, disputeId: dispute.id, order };
  }

  try {
    console.log("\n=== a. pgvector extension enabled ===");
    const ext = await db.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok FROM pg_extension WHERE extname = 'vector'`;
    ok("vector extension present", ext.length === 1);

    console.log("\n=== b. embedText → 1536-dim finite vector ===");
    const vec = await embedText("test dispute text about delivery proof");
    ok("length is 1536", vec.length === EMBEDDING_DIM);
    ok("all finite numbers", vec.every((n) => Number.isFinite(n)));

    console.log("\n=== c+d. valid output persisted + low confidence → human review ===");
    const a = await mkDisputedOrder(`qa25-a-${stamp}`);
    const beforeLedger = await db.ledgerEntry.count({ where: { walletId: sellerWalletId, reason: "SALE" } });
    setJudgeModelOverride(() => verdict("SELLER", 60));
    const r1 = await judgeDispute(a.disputeId);
    ok("JudgeResult verdict ∈ {BUYER,SELLER}", r1.verdict === "BUYER" || r1.verdict === "SELLER");
    ok("confidence in 0..100", r1.confidence >= 0 && r1.confidence <= 100);
    ok("reasoning non-empty + keyFacts array", r1.reasoning.length > 0 && Array.isArray(r1.keyFacts));
    const dispA = await db.dispute.findUniqueOrThrow({ where: { id: a.disputeId }, select: { aiVerdict: true, aiConfidence: true, status: true, judgeActorType: true } });
    ok("Dispute.aiVerdict persisted", dispA.aiVerdict === "SELLER" && dispA.aiConfidence === 60);
    ok("low confidence → requiresHumanReview", r1.requiresHumanReview && !r1.autoResolved);
    ok("dispute stays OPEN", dispA.status === "OPEN" && dispA.judgeActorType === "HUMAN");
    const afterLedger = await db.ledgerEntry.count({ where: { walletId: sellerWalletId, reason: "SALE" } });
    ok("no new SALE ledger entry (no money moved)", afterLedger === beforeLedger);

    console.log("\n=== e. high confidence → auto-resolve + correct ledger ===");
    const b = await mkDisputedOrder(`qa25-b-${stamp}`);
    setJudgeModelOverride(() => verdict("SELLER", 85));
    const r2 = await judgeDispute(b.disputeId);
    ok("autoResolved true", r2.autoResolved && !r2.requiresHumanReview);
    const dispB = await db.dispute.findUniqueOrThrow({ where: { id: b.disputeId }, select: { status: true, judgeActorType: true } });
    ok("Dispute RESOLVED_SELLER + judgeActorType AI", dispB.status === "RESOLVED_SELLER" && dispB.judgeActorType === "AI");
    const orderB = await db.order.findUniqueOrThrow({ where: { id: b.orderId }, select: { status: true } });
    ok("order COMPLETED", orderB.status === "COMPLETED");
    const saleEntries = await db.ledgerEntry.findMany({ where: { orderId: b.orderId, reason: "SALE" } });
    ok("a SALE ledger entry exists for the order", saleEntries.length >= 1);
    const bal = await getWalletBalances(sellerWalletId);
    const net = b.order.unitPriceMinor * b.order.qty - b.order.sellerFeeMinor;
    ok("wallet available reflects the released sale", bal.availableMinor === net, `avail=${bal.availableMinor} net=${net}`);

    console.log("\n=== f. embedding stored after auto-resolve ===");
    const emb = await db.$queryRaw<Array<{ has: number }>>`
      SELECT 1 AS has FROM "DisputeEmbedding" WHERE "disputeId" = ${b.disputeId} AND "embedding" IS NOT NULL`;
    ok("DisputeEmbedding row exists with non-null embedding", emb.length === 1);

    console.log("\n=== g. similar-case retrieval ===");
    const similar = await findSimilarCases("seller dispute delivery proof", 3);
    ok("returns an array", Array.isArray(similar));
    ok("similarities in [0,1]", similar.every((c) => c.similarity >= -0.0001 && c.similarity <= 1.0001));

    console.log("\n=== h. idempotency — already-resolved dispute ===");
    const confBefore = (await db.dispute.findUniqueOrThrow({ where: { id: b.disputeId }, select: { aiConfidence: true } })).aiConfidence;
    setJudgeModelOverride(() => verdict("BUYER", 99));
    const r3 = await judgeDispute(b.disputeId); // already RESOLVED_SELLER → early return
    const afterB = await db.dispute.findUniqueOrThrow({ where: { id: b.disputeId }, select: { aiConfidence: true, status: true } });
    ok("re-judge did NOT re-resolve (still RESOLVED_SELLER)", afterB.status === "RESOLVED_SELLER");
    ok("re-judge truthfully reports the prior AI resolution", r3.autoResolved === true);
    ok("aiConfidence unchanged (no re-judge of the model)", afterB.aiConfidence === confBefore);

    console.log("\n=== i. admin acceptAiVerdict ===");
    const c = await mkDisputedOrder(`qa25-c-${stamp}`);
    setJudgeModelOverride(() => verdict("SELLER", 60));
    await judgeDispute(c.disputeId); // stays OPEN (low confidence)
    const accRes = await acceptAiVerdict(adminUser.id, c.disputeId);
    ok("acceptAiVerdict ok", accRes.ok);
    const dispC = await db.dispute.findUniqueOrThrow({ where: { id: c.disputeId }, select: { status: true } });
    ok("dispute resolved (RESOLVED_SELLER)", dispC.status === "RESOLVED_SELLER");
    const accAudit = await db.auditLog.count({ where: { action: "ACCEPT_AI_VERDICT", entityId: c.disputeId } });
    ok("AuditLog ACCEPT_AI_VERDICT written", accAudit === 1);

    console.log("\n=== j. admin overrideAiVerdict (resolves + stores corrected embedding) ===");
    const d = await mkDisputedOrder(`qa25-d-${stamp}`);
    setJudgeModelOverride(() => verdict("SELLER", 60));
    await judgeDispute(d.disputeId); // OPEN, AI suggested SELLER
    const ovrRes = await overrideAiVerdict(adminUser.id, d.disputeId, "BUYER", "delivery proof was fabricated");
    ok("overrideAiVerdict ok", ovrRes.ok);
    const dispD = await db.dispute.findUniqueOrThrow({ where: { id: d.disputeId }, select: { status: true } });
    ok("dispute resolved as BUYER (refund)", dispD.status === "RESOLVED_BUYER");
    const ovrAudit = await db.auditLog.count({ where: { action: "OVERRIDE_AI_VERDICT", entityId: d.disputeId } });
    ok("AuditLog OVERRIDE_AI_VERDICT written", ovrAudit === 1);
    const ovrEmb = await db.$queryRaw<Array<{ verdict: string }>>`
      SELECT "verdict" FROM "DisputeEmbedding" WHERE "disputeId" = ${d.disputeId}`;
    ok("corrected embedding stored with verdict BUYER", ovrEmb.length === 1 && ovrEmb[0].verdict === "BUYER");

    console.log("\n=== k. no AI provider → judgeDispute throws cleanly ===");
    setJudgeModelOverride(null); // remove the test seam → real path requires a provider
    const savedKey = process.env.ANTHROPIC_API_KEY;
    const savedGroq = process.env.GROQ_API_KEY; // ai.ts now also falls back to Groq
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    resetAiCache();
    const e = await mkDisputedOrder(`qa25-e-${stamp}`);
    let threw = false;
    try {
      await judgeDispute(e.disputeId);
    } catch {
      threw = true;
    }
    ok("judgeDispute throws with NO AI provider configured", threw);
    if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey;
    if (savedGroq) process.env.GROQ_API_KEY = savedGroq;
    resetAiCache();
  } finally {
    setJudgeModelOverride(null);
    await db.disputeEmbedding.deleteMany({ where: { disputeId: { in: disputeIds } } }).catch(() => {});
    await db.ledgerEntry.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
    if (sellerWalletId) await db.ledgerEntry.deleteMany({ where: { walletId: sellerWalletId } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { entityId: { in: [...orderIds, ...disputeIds] } } }).catch(() => {});
    await db.dispute.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
    await db.orderDelivery.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
    await db.payment.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
    await db.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
    await db.listing.deleteMany({ where: { id: { in: listingIds } } }).catch(() => {});
    if (sellerWalletId) await db.wallet.deleteMany({ where: { id: sellerWalletId } }).catch(() => {});
    await db.sellerProfile.deleteMany({ where: { userId: sellerUser.id } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 25 QA — ${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  setJudgeModelOverride(null);
  await db.$disconnect();
  process.exit(1);
});
