/**
 * Step 09 QA harness — payments, webhooks, escrow ledger. Exercises the REAL
 * code paths: normalizers/verifiers as pure units, applyPaymentEvent against
 * the live dev DB, and the actual webhook ROUTE HANDLERS invoked with crafted
 * HTTP Requests (valid + invalid signatures, replays, out-of-order events).
 * Run: npx tsx scripts/qa-step09.ts   (creates marked data, cleans up after).
 */
import { createHmac, randomBytes } from "crypto";
import { db } from "../src/lib/db";
import { createOrder } from "../src/server/services/orders";
import { applyPaymentEvent } from "../src/server/services/payments";
import {
  coinGateTokenMatches,
  normalizeCoinGateOrder,
  parseCoinGateCallback,
  type CoinGateOrder,
} from "../src/server/services/payments/coingate";
import {
  normalizeRazorpayEvent,
  verifyRazorpayWebhook,
} from "../src/server/services/payments/razorpay";
import { getWalletBalances } from "../src/server/services/wallet";
import { POST as razorpayWebhook } from "../src/app/api/webhooks/razorpay/route";
import { POST as coingateWebhook } from "../src/app/api/webhooks/coingate/route";

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

const WEBHOOK_SECRET = "qa09-webhook-secret";

function rzpSigned(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

function cgOrder(over: Partial<CoinGateOrder> & { id: number }): CoinGateOrder {
  return {
    status: "paid",
    price_amount: "1050.00",
    price_currency: "INR",
    underpaid_amount: null,
    ...over,
  };
}

async function main() {
  const stamp = Date.now();
  // Deterministic env for signature/route tests (read lazily by the services).
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.COINGATE_API_KEY = "qa09-coingate-key";
  process.env.COINGATE_ENVIRONMENT = "sandbox";

  console.log("\n— CoinGate normalize (authoritative order → event) —");
  {
    const paid = normalizeCoinGateOrder(cgOrder({ id: 1 }));
    ok(
      "paid → CONFIRMED with minor-units amount",
      paid?.kind === "CONFIRMED" && paid.amountMinor === 105000 && paid.currency === "INR",
      JSON.stringify(paid),
    );
    const underInvalid = normalizeCoinGateOrder(
      cgOrder({ id: 2, status: "invalid", underpaid_amount: "200.00" }),
    );
    ok("invalid + underpaid_amount → UNDERPAID", underInvalid?.kind === "UNDERPAID");
    const underExpired = normalizeCoinGateOrder(
      cgOrder({ id: 3, status: "expired", underpaid_amount: "1.00" }),
    );
    ok("expired + underpaid_amount → UNDERPAID", underExpired?.kind === "UNDERPAID");
    ok(
      "expired (no underpay) → EXPIRED",
      normalizeCoinGateOrder(cgOrder({ id: 4, status: "expired" }))?.kind === "EXPIRED",
    );
    ok(
      "invalid (no underpay) → FAILED",
      normalizeCoinGateOrder(cgOrder({ id: 5, status: "invalid" }))?.kind === "FAILED",
    );
    ok(
      "canceled → FAILED",
      normalizeCoinGateOrder(cgOrder({ id: 6, status: "canceled" }))?.kind === "FAILED",
    );
    ok(
      "confirming → PENDING (never fulfil pre-confirmation)",
      normalizeCoinGateOrder(cgOrder({ id: 7, status: "confirming" }))?.kind === "PENDING",
    );
    ok(
      "refunded → null (Step 10, manual handling)",
      normalizeCoinGateOrder(cgOrder({ id: 8, status: "refunded" })) === null,
    );
    ok(
      "paid WITH underpaid_amount (Underpaid Cover) → UNDERPAID, never CONFIRMED",
      normalizeCoinGateOrder(cgOrder({ id: 10, status: "paid", underpaid_amount: "0.50" }))
        ?.kind === "UNDERPAID",
    );
    ok(
      "event id is per (order, status)",
      normalizeCoinGateOrder(cgOrder({ id: 9 }))?.providerEventId === "cg:9:paid",
    );
  }

  console.log("\n— CoinGate callback parse + token check —");
  {
    const json = parseCoinGateCallback(
      JSON.stringify({ id: 42, token: "tok", status: "paid" }),
      "application/json",
    );
    ok("JSON callback parsed", json?.id === "42" && json.token === "tok");
    const form = parseCoinGateCallback(
      "id=42&token=tok&status=paid",
      "application/x-www-form-urlencoded",
    );
    ok("form-encoded callback parsed", form?.id === "42" && form.token === "tok");
    ok("garbage body → null", parseCoinGateCallback("{nope", "application/json") === null);
    ok("missing token → null", parseCoinGateCallback("id=42", null) === null);
    ok("token match (constant time)", coinGateTokenMatches("secret-token", "secret-token"));
    ok("token mismatch rejected", !coinGateTokenMatches("secret-token", "evil-token"));
    ok("missing stored token rejected", !coinGateTokenMatches(null, "anything"));
  }

  console.log("\n— Razorpay signature + normalize —");
  {
    const body = JSON.stringify({ event: "payment.captured" });
    ok("valid HMAC accepted", verifyRazorpayWebhook(body, rzpSigned(body)));
    ok("tampered body rejected", !verifyRazorpayWebhook(body + " ", rzpSigned(body)));
    ok("missing signature rejected", !verifyRazorpayWebhook(body, null));

    const captured = normalizeRazorpayEvent("evt_1", {
      event: "payment.captured",
      payload: {
        payment: {
          entity: { id: "pay_1", order_id: "order_A", amount: 105000, currency: "INR", status: "captured" },
        },
      },
    });
    ok(
      "payment.captured → CONFIRMED (ref = rzp order id)",
      captured?.kind === "CONFIRMED" && captured.providerRef === "order_A" && captured.amountMinor === 105000,
    );
    const orderPaid = normalizeRazorpayEvent("evt_2", {
      event: "order.paid",
      payload: { order: { entity: { id: "order_A", amount: 105000, amount_paid: 105000, currency: "INR" } } },
    });
    ok("order.paid → CONFIRMED (same ref → CAS dedupes pair)", orderPaid?.kind === "CONFIRMED" && orderPaid.providerRef === "order_A");
    const failed = normalizeRazorpayEvent("evt_3", {
      event: "payment.failed",
      payload: { payment: { entity: { id: "pay_2", order_id: "order_A", error_code: "BAD" } } },
    });
    ok("payment.failed → FAILED", failed?.kind === "FAILED");
    ok(
      "unsubscribed event → null",
      normalizeRazorpayEvent("evt_4", { event: "refund.created", payload: {} }) === null,
    );
  }

  // --------------------------------------------------------------------
  // Integration: real DB. Marked data, cleaned up in finally.
  // --------------------------------------------------------------------
  const emails = {
    buyer: `qa09-buyer-${stamp}@test.getx.live`,
    seller: `qa09-seller-${stamp}@test.getx.live`,
  };
  const buyer = await db.user.create({ data: { email: emails.buyer, emailVerified: new Date() } });
  const sellerUser = await db.user.create({ data: { email: emails.seller, emailVerified: new Date() } });
  const seller = await db.sellerProfile.create({
    data: { userId: sellerUser.id, displayName: "QA09 Seller" },
  });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  const mkListing = (slug: string, stock: number) =>
    db.listing.create({
      data: {
        sellerId: seller.id,
        gameId: game.id,
        categoryId: cat.id,
        type: cat.kind,
        title: `QA09 ${slug}`,
        slug,
        description: "QA09 listing",
        priceMinor: 100000,
        currency: "INR",
        stock,
        deliveryType: "MANUAL",
        status: "ACTIVE",
        attributes: {},
      },
    });

  const buyerSession = { id: buyer.id, role: "BUYER" as const };
  const mkOrder = async (slug: string, stock = 2, qty = 1) => {
    const listing = await mkListing(slug, stock);
    const order = await createOrder(buyerSession, { listingSlug: slug, qty });
    return { listing, order };
  };
  const mkPayment = (
    orderId: string,
    provider: "COINGATE" | "RAZORPAY",
    ref: string,
    amountMinor: number,
    webhookToken?: string,
  ) =>
    db.payment.create({
      data: {
        orderId,
        provider,
        providerRef: ref,
        webhookToken: webhookToken ?? null,
        amountMinor,
        currency: "INR",
        status: "PENDING",
      },
    });

  const refs: string[] = [];
  const cleanupIds: string[] = [];

  try {
    console.log("\n— applyPaymentEvent: confirmed → PAID + escrow + stock —");
    const a = await mkOrder(`qa09-a-${stamp}`, 2, 1);
    cleanupIds.push(a.order.id, a.listing.id);
    const refA = `qa09-ref-a-${stamp}`;
    refs.push(refA);
    await mkPayment(a.order.id, "RAZORPAY", refA, a.order.totalMinor);

    const confirmedA = {
      provider: "RAZORPAY" as const,
      providerEventId: `qa09-evt-a1-${stamp}`,
      providerRef: refA,
      kind: "CONFIRMED" as const,
      amountMinor: a.order.totalMinor,
      currency: "INR",
      raw: { qa: true },
    };
    const r1 = await applyPaymentEvent(confirmedA);
    ok("outcome applied → PAID", r1.outcome === "applied" && r1.orderStatus === "PAID", JSON.stringify(r1));

    const orderA = await db.order.findUniqueOrThrow({ where: { id: a.order.id } });
    ok("order status PAID + provider stamped", orderA.status === "PAID" && orderA.paymentProvider === "RAZORPAY");
    const payA = await db.payment.findFirstOrThrow({ where: { orderId: a.order.id } });
    ok("payment row CONFIRMED with raw audit", payA.status === "CONFIRMED" && payA.raw !== null);

    const ledgerA = await db.ledgerEntry.findMany({ where: { orderId: a.order.id } });
    ok(
      "exactly ONE ESCROW_HOLD credit of totalMinor",
      ledgerA.length === 1 &&
        ledgerA[0].type === "CREDIT" &&
        ledgerA[0].reason === "ESCROW_HOLD" &&
        ledgerA[0].amountMinor === a.order.totalMinor,
      JSON.stringify(ledgerA),
    );
    const wallet = await db.wallet.findUniqueOrThrow({ where: { sellerProfileId: seller.id } });
    const bal = await getWalletBalances(wallet.id);
    ok(
      "wallet: held = totalMinor, available = 0 (escrow ≠ seller money)",
      bal.heldMinor === a.order.totalMinor && bal.availableMinor === 0,
      JSON.stringify(bal),
    );
    const listA = await db.listing.findUniqueOrThrow({ where: { id: a.listing.id } });
    ok("stock decremented at PAYMENT (2→1), listing still ACTIVE", listA.stock === 1 && listA.status === "ACTIVE");

    console.log("\n— idempotency: replay + duplicate (no double escrow) —");
    const r2 = await applyPaymentEvent(confirmedA);
    ok("same event id replayed → duplicate no-op", r2.outcome === "duplicate");
    const r3 = await applyPaymentEvent({
      ...confirmedA,
      providerEventId: `qa09-evt-a2-${stamp}`, // the order.paid twin
    });
    ok("paired event (new id, same ref) → ignored already_paid", r3.outcome === "ignored" && r3.reason === "already_paid");
    ok(
      "ledger STILL exactly one entry (no double escrow)",
      (await db.ledgerEntry.count({ where: { orderId: a.order.id } })) === 1,
    );

    console.log("\n— out-of-order: late EXPIRED after PAID —");
    const r4 = await applyPaymentEvent({
      ...confirmedA,
      providerEventId: `qa09-evt-a3-${stamp}`,
      kind: "EXPIRED",
      amountMinor: null,
      currency: null,
    });
    ok("late expired → ignored stale, order stays PAID", r4.outcome === "ignored");
    ok("order still PAID", (await db.order.findUniqueOrThrow({ where: { id: a.order.id } })).status === "PAID");

    console.log("\n— amount mismatch quarantined —");
    const b = await mkOrder(`qa09-b-${stamp}`);
    cleanupIds.push(b.order.id, b.listing.id);
    const refB = `qa09-ref-b-${stamp}`;
    refs.push(refB);
    await mkPayment(b.order.id, "RAZORPAY", refB, b.order.totalMinor);
    const r5 = await applyPaymentEvent({
      provider: "RAZORPAY",
      providerEventId: `qa09-evt-b1-${stamp}`,
      providerRef: refB,
      kind: "CONFIRMED",
      amountMinor: b.order.totalMinor - 1, // off by one paisa → quarantine
      currency: "INR",
      raw: { qa: true },
    });
    ok("wrong amount → amount_mismatch (NOT paid)", r5.outcome === "amount_mismatch");
    ok(
      "order untouched (AWAITING_PAYMENT), no ledger",
      (await db.order.findUniqueOrThrow({ where: { id: b.order.id } })).status === "AWAITING_PAYMENT" &&
        (await db.ledgerEntry.count({ where: { orderId: b.order.id } })) === 0,
    );
    ok(
      "audit row PAYMENT_AMOUNT_MISMATCH written",
      (await db.auditLog.count({ where: { action: "PAYMENT_AMOUNT_MISMATCH", entityId: b.order.id } })) === 1,
    );
    const r5b = await applyPaymentEvent({
      provider: "RAZORPAY",
      providerEventId: `qa09-evt-b2-${stamp}`,
      providerRef: refB,
      kind: "CONFIRMED",
      amountMinor: b.order.totalMinor,
      currency: "USD", // right number, wrong currency
      raw: { qa: true },
    });
    ok("currency mismatch also quarantined", r5b.outcome === "amount_mismatch");

    console.log("\n— underpaid / expired / failed paths —");
    const c = await mkOrder(`qa09-c-${stamp}`);
    cleanupIds.push(c.order.id, c.listing.id);
    const refC = `qa09-ref-c-${stamp}`;
    refs.push(refC);
    await mkPayment(c.order.id, "COINGATE", refC, c.order.totalMinor);
    const r6 = await applyPaymentEvent({
      provider: "COINGATE",
      providerEventId: `qa09-evt-c1-${stamp}`,
      providerRef: refC,
      kind: "UNDERPAID",
      amountMinor: null,
      currency: null,
      raw: { qa: true },
    });
    ok("UNDERPAID applied", r6.outcome === "applied" && r6.orderStatus === "UNDERPAID");
    const r7 = await applyPaymentEvent({
      provider: "COINGATE",
      providerEventId: `qa09-evt-c2-${stamp}`,
      providerRef: refC,
      kind: "CONFIRMED",
      amountMinor: c.order.totalMinor,
      currency: "INR",
      raw: { qa: true },
    });
    ok("UNDERPAID → PAID allowed (reconciled), escrow written once", r7.outcome === "applied" && r7.orderStatus === "PAID");
    ok("ledger exactly 1 for order C", (await db.ledgerEntry.count({ where: { orderId: c.order.id } })) === 1);

    const d = await mkOrder(`qa09-d-${stamp}`);
    cleanupIds.push(d.order.id, d.listing.id);
    const refD = `qa09-ref-d-${stamp}`;
    refs.push(refD);
    await mkPayment(d.order.id, "COINGATE", refD, d.order.totalMinor);
    const r8 = await applyPaymentEvent({
      provider: "COINGATE",
      providerEventId: `qa09-evt-d1-${stamp}`,
      providerRef: refD,
      kind: "EXPIRED",
      amountMinor: null,
      currency: null,
      raw: { qa: true },
    });
    ok("EXPIRED applied to awaiting order", r8.outcome === "applied" && r8.orderStatus === "EXPIRED");

    const e = await mkOrder(`qa09-e-${stamp}`);
    cleanupIds.push(e.order.id, e.listing.id);
    const refE = `qa09-ref-e-${stamp}`;
    refs.push(refE);
    await mkPayment(e.order.id, "RAZORPAY", refE, e.order.totalMinor);
    const r9 = await applyPaymentEvent({
      provider: "RAZORPAY",
      providerEventId: `qa09-evt-e1-${stamp}`,
      providerRef: refE,
      kind: "FAILED",
      amountMinor: null,
      currency: null,
      raw: { qa: true },
    });
    ok(
      "FAILED attempt → order STAYS payable",
      r9.outcome === "applied" && r9.orderStatus === "AWAITING_PAYMENT",
    );
    ok(
      "payment row FAILED",
      (await db.payment.findFirstOrThrow({ where: { orderId: e.order.id } })).status === "FAILED",
    );

    console.log("\n— unknown ref + sold-out + oversold —");
    const r10 = await applyPaymentEvent({
      provider: "RAZORPAY",
      providerEventId: `qa09-evt-x1-${stamp}`,
      providerRef: `qa09-ref-ghost-${stamp}`,
      kind: "CONFIRMED",
      amountMinor: 1,
      currency: "INR",
      raw: { qa: true },
    });
    ok("unknown providerRef → ignored", r10.outcome === "ignored" && r10.reason === "unknown_provider_ref");

    const f = await mkOrder(`qa09-f-${stamp}`, 1, 1); // last unit
    cleanupIds.push(f.order.id, f.listing.id);
    const refF = `qa09-ref-f-${stamp}`;
    refs.push(refF);
    await mkPayment(f.order.id, "RAZORPAY", refF, f.order.totalMinor);
    await applyPaymentEvent({
      provider: "RAZORPAY",
      providerEventId: `qa09-evt-f1-${stamp}`,
      providerRef: refF,
      kind: "CONFIRMED",
      amountMinor: f.order.totalMinor,
      currency: "INR",
      raw: { qa: true },
    });
    const listF = await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } });
    ok("last unit sold → stock 0 + listing SOLD", listF.stock === 0 && listF.status === "SOLD");

    const g = await mkOrder(`qa09-g-${stamp}`, 1, 1);
    cleanupIds.push(g.order.id, g.listing.id);
    const refG = `qa09-ref-g-${stamp}`;
    refs.push(refG);
    await mkPayment(g.order.id, "RAZORPAY", refG, g.order.totalMinor);
    // Simulate a stock race: someone else's paid order already consumed it.
    await db.listing.update({ where: { id: g.listing.id }, data: { stock: 0 } });
    const r11 = await applyPaymentEvent({
      provider: "RAZORPAY",
      providerEventId: `qa09-evt-g1-${stamp}`,
      providerRef: refG,
      kind: "CONFIRMED",
      amountMinor: g.order.totalMinor,
      currency: "INR",
      raw: { qa: true },
    });
    ok(
      "oversold race → still PAID (money is real) + flagged",
      r11.outcome === "applied" && r11.oversold === true,
    );
    ok(
      "LISTING_OVERSOLD audit row written",
      (await db.auditLog.count({ where: { action: "LISTING_OVERSOLD", entityId: g.listing.id } })) === 1,
    );

    console.log("\n— CoinGate INR→USD charge + re-price drift guard —");
    // INR order invoiced in USD (CoinGate doesn't accept INR): the webhook
    // must confirm the USD CHARGE, while the snapshot ties it to INR economics.
    const u = await mkOrder(`qa09-u-${stamp}`);
    cleanupIds.push(u.order.id, u.listing.id);
    const refU = `qa09-ref-u-${stamp}`;
    refs.push(refU);
    await db.payment.create({
      data: {
        orderId: u.order.id,
        provider: "COINGATE",
        providerRef: refU,
        amountMinor: 127, // $1.27 — the USD charge
        currency: "USD",
        status: "PENDING",
        raw: { forOrderTotalMinor: u.order.totalMinor, forOrderCurrency: "INR" },
      },
    });
    const rU = await applyPaymentEvent({
      provider: "COINGATE",
      providerEventId: `qa09-evt-u1-${stamp}`,
      providerRef: refU,
      kind: "CONFIRMED",
      amountMinor: 127,
      currency: "USD",
      raw: { qa: true },
    });
    ok("USD charge confirmed → INR order PAID", rU.outcome === "applied" && rU.orderStatus === "PAID");
    const ledgerU = await db.ledgerEntry.findFirstOrThrow({ where: { orderId: u.order.id } });
    ok(
      "escrow hold is the INR order total (never the USD charge)",
      ledgerU.amountMinor === u.order.totalMinor && ledgerU.reason === "ESCROW_HOLD",
    );

    const v = await mkOrder(`qa09-v-${stamp}`);
    cleanupIds.push(v.order.id, v.listing.id);
    const refV = `qa09-ref-v-${stamp}`;
    refs.push(refV);
    await db.payment.create({
      data: {
        orderId: v.order.id,
        provider: "COINGATE",
        providerRef: refV,
        amountMinor: 127,
        currency: "USD",
        status: "PENDING",
        // Snapshot says the charge was made for a CHEAPER total → the order
        // was re-priced after invoicing. Must quarantine, never PAID.
        raw: { forOrderTotalMinor: v.order.totalMinor - 5000, forOrderCurrency: "INR" },
      },
    });
    const rV = await applyPaymentEvent({
      provider: "COINGATE",
      providerEventId: `qa09-evt-v1-${stamp}`,
      providerRef: refV,
      kind: "CONFIRMED",
      amountMinor: 127,
      currency: "USD",
      raw: { qa: true },
    });
    ok("stale invoice after re-price → quarantined", rV.outcome === "amount_mismatch");
    ok(
      "re-priced order untouched, no ledger",
      (await db.order.findUniqueOrThrow({ where: { id: v.order.id } })).status === "AWAITING_PAYMENT" &&
        (await db.ledgerEntry.count({ where: { orderId: v.order.id } })) === 0,
    );
    // Quarantine must NOT consume the event id — a replay re-evaluates (so a
    // human-corrected order can still be paid by the provider's retry).
    const rVreplay = await applyPaymentEvent({
      provider: "COINGATE",
      providerEventId: `qa09-evt-v1-${stamp}`, // SAME id as the quarantined event
      providerRef: refV,
      kind: "CONFIRMED",
      amountMinor: 127,
      currency: "USD",
      raw: { qa: true },
    });
    ok(
      "replay after quarantine re-evaluates (not duplicate)",
      rVreplay.outcome === "amount_mismatch",
      JSON.stringify(rVreplay),
    );
    const vSnap = (await db.payment.findFirstOrThrow({ where: { orderId: v.order.id } }))
      .raw as { forOrderTotalMinor?: unknown };
    ok(
      "drift snapshot SURVIVES quarantine raw updates",
      vSnap.forOrderTotalMinor === v.order.totalMinor - 5000,
    );

    // Fail CLOSED: a CONFIRMED whose amount we couldn't parse is never trusted.
    const w = await mkOrder(`qa09-w-${stamp}`);
    cleanupIds.push(w.order.id, w.listing.id);
    const refW = `qa09-ref-w-${stamp}`;
    refs.push(refW);
    await mkPayment(w.order.id, "COINGATE", refW, w.order.totalMinor);
    const rW = await applyPaymentEvent({
      provider: "COINGATE",
      providerEventId: `qa09-evt-w1-${stamp}`,
      providerRef: refW,
      kind: "CONFIRMED",
      amountMinor: null, // unparseable gateway amount
      currency: null,
      raw: { qa: true },
    });
    ok("CONFIRMED with null amount → quarantined (fail closed)", rW.outcome === "amount_mismatch");
    ok(
      "null-amount confirm: order untouched, no ledger",
      (await db.order.findUniqueOrThrow({ where: { id: w.order.id } })).status === "AWAITING_PAYMENT" &&
        (await db.ledgerEntry.count({ where: { orderId: w.order.id } })) === 0,
    );

    console.log("\n— concurrency: parallel confirms, ONE escrow —");
    const h = await mkOrder(`qa09-h-${stamp}`);
    cleanupIds.push(h.order.id, h.listing.id);
    const refH = `qa09-ref-h-${stamp}`;
    refs.push(refH);
    await mkPayment(h.order.id, "RAZORPAY", refH, h.order.totalMinor);
    const mkConfirm = (n: number) =>
      applyPaymentEvent({
        provider: "RAZORPAY",
        providerEventId: `qa09-evt-h${n}-${stamp}`,
        providerRef: refH,
        kind: "CONFIRMED",
        amountMinor: h.order.totalMinor,
        currency: "INR",
        raw: { qa: true },
      });
    const racers = await Promise.all([mkConfirm(1), mkConfirm(2), mkConfirm(3)]);
    const appliedCount = racers.filter((r) => r.outcome === "applied").length;
    ok(
      "exactly ONE of 3 concurrent confirms applied",
      appliedCount === 1,
      JSON.stringify(racers.map((r) => r.outcome)),
    );
    ok(
      "ledger exactly 1 entry under concurrency",
      (await db.ledgerEntry.count({ where: { orderId: h.order.id } })) === 1,
    );

    // ------------------------------------------------------------------
    // ROUTE-level replay tests (the real HTTP handlers).
    // ------------------------------------------------------------------
    console.log("\n— Razorpay webhook ROUTE: signature + replay —");
    const i = await mkOrder(`qa09-i-${stamp}`);
    cleanupIds.push(i.order.id, i.listing.id);
    const refI = `order_qa09I${stamp}`;
    refs.push(refI);
    await mkPayment(i.order.id, "RAZORPAY", refI, i.order.totalMinor);
    const rzpBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_qa09${stamp}`,
            order_id: refI,
            amount: i.order.totalMinor,
            currency: "INR",
            status: "captured",
            method: "upi",
          },
        },
      },
    });
    const rzpReq = (sig: string, eventId: string) =>
      new Request("http://localhost/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": sig,
          "x-razorpay-event-id": eventId,
        },
        body: rzpBody,
      });

    const badSig = await razorpayWebhook(rzpReq("0".repeat(64), `qa09-rt-i0-${stamp}`));
    ok("invalid signature → 401, order untouched", badSig.status === 401);
    ok(
      "order still AWAITING_PAYMENT after forged call",
      (await db.order.findUniqueOrThrow({ where: { id: i.order.id } })).status === "AWAITING_PAYMENT",
    );

    const goodSig = await razorpayWebhook(rzpReq(rzpSigned(rzpBody), `qa09-rt-i1-${stamp}`));
    ok("valid signature → 200 + order PAID", goodSig.status === 200);
    ok(
      "route applied: PAID + 1 escrow entry",
      (await db.order.findUniqueOrThrow({ where: { id: i.order.id } })).status === "PAID" &&
        (await db.ledgerEntry.count({ where: { orderId: i.order.id } })) === 1,
    );

    const replay = await razorpayWebhook(rzpReq(rzpSigned(rzpBody), `qa09-rt-i1-${stamp}`));
    ok("exact replay (same event id) → 200 no-op", replay.status === 200);
    const twin = await razorpayWebhook(rzpReq(rzpSigned(rzpBody), `qa09-rt-i2-${stamp}`));
    ok("order.paid twin (new event id) → 200 no-op", twin.status === 200);
    ok(
      "STILL exactly 1 escrow entry after replays",
      (await db.ledgerEntry.count({ where: { orderId: i.order.id } })) === 1,
    );

    console.log("\n— CoinGate webhook ROUTE: token + authoritative re-fetch —");
    const j = await mkOrder(`qa09-j-${stamp}`);
    cleanupIds.push(j.order.id, j.listing.id);
    const cgId = Math.floor(stamp / 1000); // numeric CoinGate id
    const refJ = String(cgId);
    refs.push(refJ);
    const cgToken = randomBytes(16).toString("hex");
    await mkPayment(j.order.id, "COINGATE", refJ, j.order.totalMinor, cgToken);

    // Stub the authoritative re-fetch (GET /api/v2/orders/:id).
    const realFetch = global.fetch;
    const totalMajor = (j.order.totalMinor / 100).toFixed(2);
    global.fetch = (async () =>
      new Response(
        JSON.stringify(
          cgOrder({ id: cgId, status: "paid", price_amount: totalMajor, token: cgToken }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    try {
      const cgReq = (token: string) =>
        new Request("http://localhost/api/webhooks/coingate", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            id: refJ,
            order_id: j.order.id,
            status: "paid", // callback body says paid — but truth is the re-fetch
            token,
          }).toString(),
        });

      const wrongTok = await coingateWebhook(cgReq("not-the-token"));
      ok("wrong token → 401, nothing processed", wrongTok.status === 401);
      ok(
        "order untouched after bad token",
        (await db.order.findUniqueOrThrow({ where: { id: j.order.id } })).status === "AWAITING_PAYMENT",
      );

      const goodTok = await coingateWebhook(cgReq(cgToken));
      ok("valid token + re-fetched 'paid' → 200 + PAID", goodTok.status === 200);
      ok(
        "CoinGate path: PAID + 1 escrow entry",
        (await db.order.findUniqueOrThrow({ where: { id: j.order.id } })).status === "PAID" &&
          (await db.ledgerEntry.count({ where: { orderId: j.order.id } })) === 1,
      );

      const cgReplay = await coingateWebhook(cgReq(cgToken));
      ok("CoinGate replay (same status) → 200 no-op", cgReplay.status === 200);
      ok(
        "STILL exactly 1 escrow entry after CoinGate replay",
        (await db.ledgerEntry.count({ where: { orderId: j.order.id } })) === 1,
      );
    } finally {
      global.fetch = realFetch;
    }

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    // Cleanup all marked rows (FK-safe order). Payments/ledger cascade with
    // orders/wallets; audit + processed-webhook rows are deleted explicitly.
    await db.processedWebhook.deleteMany({
      where: { providerEventId: { contains: `${stamp}` } },
    });
    await db.auditLog.deleteMany({
      where: { entityId: { in: [...cleanupIds, ...refs, `qa09-ref-ghost-${stamp}`] } },
    });
    await db.order.deleteMany({ where: { buyer: { email: { in: Object.values(emails) } } } });
    await db.listing.deleteMany({
      where: { seller: { user: { email: { in: Object.values(emails) } } } },
    });
    await db.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await db.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
