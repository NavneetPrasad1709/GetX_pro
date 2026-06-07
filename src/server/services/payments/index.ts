import type { PaymentProvider, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createCoinGateCharge } from "./coingate";
import { createRazorpayCharge } from "./razorpay";
import { PaymentGatewayError, type CreateChargeResult } from "./types";

export { applyPaymentEvent, type ApplyEventResult } from "./apply-event";
export { PaymentGatewayError } from "./types";
export type { CreateChargeResult, NormalizedPaymentEvent } from "./types";

/**
 * Start a payment for an order (Step 09). SERVER-SIDE ONLY — called from the
 * startPaymentAction after auth + Zod. Re-checks (a) the caller OWNS the order
 * as its buyer and (b) the order is actually payable, then asks the chosen
 * gateway for a charge. All money figures come from the DB order row — the
 * client only ever sends an order id + provider choice.
 */
export async function createChargeForOrder(
  user: { id: string; role: Role },
  orderId: string,
  provider: PaymentProvider,
): Promise<CreateChargeResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      status: true,
      totalMinor: true,
      currency: true,
      paymentProvider: true,
      listing: { select: { title: true } },
      buyer: { select: { email: true } },
    },
  });

  // Not yours → same answer as not found (no order enumeration).
  if (!order || order.buyerId !== user.id) {
    throw new PaymentGatewayError("Order not found.");
  }
  if (order.status !== "AWAITING_PAYMENT") {
    throw new PaymentGatewayError(
      order.status === "UNDERPAID"
        ? "This order received a partial payment — our support team will reconcile or refund it."
        : "This order is not awaiting payment.",
    );
  }

  // Remember the buyer's latest gateway choice (display + analytics; the
  // CONFIRMED webhook re-stamps it with the provider that actually paid).
  if (order.paymentProvider !== provider) {
    await db.order.update({
      where: { id: order.id },
      data: { paymentProvider: provider },
    });
  }

  const charge = {
    id: order.id,
    totalMinor: order.totalMinor,
    currency: order.currency,
    listingTitle: order.listing.title,
    buyerEmail: order.buyer.email,
  };

  return provider === "COINGATE"
    ? createCoinGateCharge(charge)
    : createRazorpayCharge(charge);
}
