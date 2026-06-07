import type { PaymentProvider, Prisma } from "@prisma/client";

/**
 * Payment gateway abstraction (Step 09). Each provider (CoinGate, Razorpay)
 * implements this contract; everything downstream (webhook routes, the
 * applyPaymentEvent money transaction, the QA harness) speaks ONLY in
 * normalized events — provider quirks stay inside the provider module.
 */

/** What a verified webhook means for us, provider-agnostic. */
export type PaymentEventKind =
  /** money confirmed in full — move order to PAID + escrow hold */
  | "CONFIRMED"
  /** buyer paid less than the invoice (crypto) — order UNDERPAID */
  | "UNDERPAID"
  /** the charge expired unpaid — order EXPIRED */
  | "EXPIRED"
  /** attempt failed/cancelled — payment FAILED, order stays payable */
  | "FAILED"
  /** in-flight status (pending/confirming) — audit only, no order change */
  | "PENDING";

export type NormalizedPaymentEvent = {
  provider: PaymentProvider;
  /**
   * Idempotency key (guardrails §2). Razorpay sends a real event id; CoinGate
   * callbacks have none, so we synthesize `${coingateOrderId}:${status}` —
   * replays of the same status dedupe, real status progressions still apply.
   */
  providerEventId: string;
  /** the gateway's order/charge id — joins to Payment.providerRef */
  providerRef: string;
  kind: PaymentEventKind;
  /**
   * Amount the gateway says this charge is for, in MINOR units of `currency`.
   * null = the event doesn't assert an amount (e.g. expiry). When present it
   * MUST equal the order total or the event is quarantined (never auto-PAID).
   */
  amountMinor: number | null;
  currency: string | null;
  /** sanitized provider payload, stored on Payment.raw for audit */
  raw: Prisma.InputJsonValue;
};

/** Everything a gateway needs to create a charge for an order. */
export type ChargeOrder = {
  id: string;
  totalMinor: number;
  currency: string;
  listingTitle: string;
  buyerEmail: string | null;
};

/** What the UI needs to send the buyer into the gateway's payment flow. */
export type CreateChargeResult =
  | {
      provider: "COINGATE";
      /** Payment row we created/reused for this charge */
      paymentId: string;
      /** hosted invoice — redirect the buyer here */
      redirectUrl: string;
    }
  | {
      provider: "RAZORPAY";
      paymentId: string;
      /** options for Razorpay Standard Checkout on the client */
      checkout: {
        keyId: string;
        rzpOrderId: string;
        amountMinor: number;
        currency: string;
        name: string;
        description: string;
        prefillEmail: string | null;
      };
    };

export class PaymentGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}
