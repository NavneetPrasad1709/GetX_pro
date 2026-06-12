/**
 * Step 14 QA harness — wallet + payouts. Exercises the REAL service against the
 * live dev DB: ledger-derived balances, reservation on request (DEBIT/PAYOUT),
 * insufficient/min guards, the wallet-lock under concurrent double-requests,
 * PAID (no ledger change) + FAILED (CREDIT reversal), idempotency, and that
 * escrow-held funds are never withdrawable. Run: npx tsx scripts/qa-step14.ts
 */
import { db } from "../src/lib/db";
import { getWalletBalances } from "../src/server/services/wallet";
import {
  getWalletOverview,
  markPayoutFailed,
  markPayoutPaid,
  requestPayout,
} from "../src/server/services/payouts";

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

async function main() {
  const stamp = Date.now();
  const emails = {
    a: `qa14-a-${stamp}@test.getx.live`,
    b: `qa14-b-${stamp}@test.getx.live`,
  };
  const userA = await db.user.create({ data: { email: emails.a, emailVerified: new Date() } });
  const userB = await db.user.create({ data: { email: emails.b, emailVerified: new Date() } });
  const sellerA = await db.sellerProfile.create({ data: { userId: userA.id, displayName: "QA14 A" } });
  const sellerB = await db.sellerProfile.create({ data: { userId: userB.id, displayName: "QA14 B" } });
  const walletA = await db.wallet.create({ data: { sellerProfileId: sellerA.id, currency: "INR" } });
  const walletB = await db.wallet.create({ data: { sellerProfileId: sellerB.id, currency: "INR" } });
  // P1-T1: a saved payout destination is required before any withdrawal.
  await db.payoutAccount.create({ data: { userId: userA.id, method: "RAZORPAY", holderName: "QA14 A", upiVpa: "qa14a@upi", maskedHint: "qa14a@upi" } });
  await db.payoutAccount.create({ data: { userId: userB.id, method: "RAZORPAY", holderName: "QA14 B", upiVpa: "qa14b@upi", maskedHint: "qa14b@upi" } });

  const seed = (walletId: string, type: "CREDIT" | "DEBIT", reason: "SALE" | "ESCROW_HOLD", amount: number, after: number) =>
    db.ledgerEntry.create({ data: { walletId, type, reason, amountMinor: amount, balanceAfterMinor: after } });

  // Seller A: ₹1000 available (SALE) + ₹500 still in escrow (ESCROW_HOLD).
  await seed(walletA.id, "CREDIT", "SALE", 100000, 100000);
  await seed(walletA.id, "CREDIT", "ESCROW_HOLD", 50000, 150000);
  // Seller B: ₹1000 available, used for the concurrency test.
  await seed(walletB.id, "CREDIT", "SALE", 100000, 100000);

  const payoutEntries = (walletId: string) =>
    db.ledgerEntry.count({ where: { walletId, reason: "PAYOUT" } });

  try {
    console.log("\n— ledger-derived balances (available vs held) —");
    const ov0 = await getWalletOverview(userA.id);
    ok("available = 100000, held = 50000, pending = 0", ov0.availableMinor === 100000 && ov0.heldMinor === 50000 && ov0.pendingPayoutMinor === 0, JSON.stringify(ov0));

    console.log("\n— min + insufficient guards —");
    const belowMin = await threw(() => requestPayout(userA.id, 10000)); // < ₹500 min
    ok("below minimum rejected", belowMin?.includes("Minimum") === true, belowMin ?? "");
    const tooMuch = await threw(() => requestPayout(userA.id, 120000)); // > available
    ok("above available rejected", tooMuch?.includes("available") === true, tooMuch ?? "");
    ok("no reserve written for rejected requests", (await payoutEntries(walletA.id)) === 0);

    console.log("\n— request reserves funds (DEBIT/PAYOUT) —");
    const p1 = await requestPayout(userA.id, 50000);
    ok("payout REQUESTED", p1.status === "REQUESTED" && p1.amountMinor === 50000);
    const ov1 = await getWalletOverview(userA.id);
    ok("available dropped to 50000, pending 50000 (reserved), held unchanged", ov1.availableMinor === 50000 && ov1.pendingPayoutMinor === 50000 && ov1.heldMinor === 50000, JSON.stringify(ov1));
    ok("exactly one DEBIT/PAYOUT reserve entry", (await db.ledgerEntry.count({ where: { walletId: walletA.id, type: "DEBIT", reason: "PAYOUT" } })) === 1);

    console.log("\n— PAID = status only, no ledger change —");
    const paid = await markPayoutPaid(userA.id, p1.id);
    ok("markPayoutPaid → updated", paid === "updated");
    ok("payout PAID", (await db.payout.findUniqueOrThrow({ where: { id: p1.id } })).status === "PAID");
    ok("available still 50000 (DEBIT stands, no new entry)", (await getWalletOverview(userA.id)).availableMinor === 50000);
    ok("markPayoutPaid again → noop (idempotent)", (await markPayoutPaid(userA.id, p1.id)) === "noop");

    console.log("\n— escrow-held funds are never withdrawable —");
    const p2 = await requestPayout(userA.id, 50000); // drains available to 0
    const ovDrained = await getWalletOverview(userA.id);
    ok("available now 0, but 50000 still held", ovDrained.availableMinor === 0 && ovDrained.heldMinor === 50000);
    const grabHeld = await threw(() => requestPayout(userA.id, 50000)); // tries to take the held 500
    ok("cannot withdraw the escrow-held balance", grabHeld?.includes("available") === true, grabHeld ?? "");

    console.log("\n— FAILED reverses the reserve (CREDIT back) —");
    const failed = await markPayoutFailed(userA.id, p2.id, "invalid bank details");
    ok("markPayoutFailed → updated", failed === "updated");
    ok("payout FAILED", (await db.payout.findUniqueOrThrow({ where: { id: p2.id } })).status === "FAILED");
    ok("reversal CREDIT/PAYOUT written", (await db.ledgerEntry.count({ where: { walletId: walletA.id, type: "CREDIT", reason: "PAYOUT" } })) === 1);
    const ovReversed = await getWalletOverview(userA.id);
    ok("available restored to 50000 after reversal", ovReversed.availableMinor === 50000, JSON.stringify(ovReversed));
    ok("markPayoutFailed again → noop (no double-credit)", (await markPayoutFailed(userA.id, p2.id, "again")) === "noop");
    ok("still exactly one reversal CREDIT", (await db.ledgerEntry.count({ where: { walletId: walletA.id, type: "CREDIT", reason: "PAYOUT" } })) === 1);

    // Final reconciliation: gross 150000 − DEBIT 50000(p1 paid) − DEBIT 50000(p2) + CREDIT 50000(p2 reversal) = 100000; held 50000; available 50000.
    const balA = await getWalletBalances(walletA.id);
    ok("reconciles: gross 100000, held 50000, available 50000", balA.grossMinor === 100000 && balA.heldMinor === 50000 && balA.availableMinor === 50000, JSON.stringify(balA));

    console.log("\n— concurrency: two parallel full-balance requests, only ONE wins —");
    const racers = await Promise.allSettled([
      requestPayout(userB.id, 100000),
      requestPayout(userB.id, 100000),
    ]);
    const fulfilled = racers.filter((r) => r.status === "fulfilled").length;
    ok("exactly one of two concurrent full withdrawals succeeded", fulfilled === 1, JSON.stringify(racers.map((r) => r.status)));
    ok("wallet B never over-withdrawn (available >= 0)", (await getWalletBalances(walletB.id)).availableMinor === 0);
    ok("exactly one reserve entry on wallet B", (await payoutEntries(walletB.id)) === 1);

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    await db.auditLog.deleteMany({ where: { actorId: { in: [userA.id, userB.id] } } });
    await db.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await db.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
