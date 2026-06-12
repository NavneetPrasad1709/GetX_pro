import {
  Prisma,
  type LedgerReason,
  type Role,
} from "@prisma/client";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";
import { getWalletBalances } from "@/server/services/wallet";
import { PLATFORM_WALLET_ID } from "@/server/services/escrow";

/**
 * Opt-in monetization (Prompt 15) — GETX Pro subscription only. SERVER-SIDE ONLY.
 * All pay-for-visibility levers (Boost, Bump, Spotlight) were removed so ranking
 * is fully organic and can't be bought (O-T15).
 *
 * Money rules (guardrails §1/§5): every charge is a DEBIT on the seller wallet +
 * a CREDIT FEE on the single PLATFORM wallet, inside ONE transaction, with the
 * seller wallet row LOCKED (FOR UPDATE) before reading the available balance.
 * Non-order fees carry orderId = null on the ledger (the column is nullable).
 */

export class MonetizationServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonetizationServiceError";
  }
}

type Tx = Prisma.TransactionClient;
type SessionUser = { id: string; role: Role };

const DAY_MS = 24 * 60 * 60 * 1000;

async function lockWallet(tx: Tx, walletId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
}

/**
 * Charge `amountMinor` from a seller's AVAILABLE balance to platform revenue.
 * Locks the seller wallet, validates available funds, writes the DEBIT + the
 * PLATFORM CREDIT FEE, and refreshes both cached balances. Throws if the seller
 * can't cover it (escrow-held money is never spendable here).
 */
async function chargeSellerToPlatform(
  tx: Tx,
  sellerProfileId: string,
  currency: string,
  amountMinor: number,
  reason: Extract<LedgerReason, "SUBSCRIPTION_FEE">,
): Promise<void> {
  // Ensure + lock the seller wallet BEFORE reading available funds.
  const wallet = await tx.wallet.upsert({
    where: { sellerProfileId },
    create: { sellerProfileId, currency },
    update: {},
    select: { id: true },
  });
  await lockWallet(tx, wallet.id);

  const { availableMinor, grossMinor } = await getWalletBalances(wallet.id, tx);
  if (availableMinor < amountMinor) {
    throw new MonetizationServiceError(
      "Not enough available balance — top up your wallet from a completed sale first.",
    );
  }

  // Seller wallet: DEBIT the fee (orderId null — not tied to an order).
  const sellerAfter = grossMinor - amountMinor;
  await tx.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      orderId: null,
      type: "DEBIT",
      reason,
      amountMinor,
      balanceAfterMinor: sellerAfter,
    },
  });
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { cachedBalanceMinor: sellerAfter },
  });

  // Platform wallet: CREDIT FEE (race-safe get-or-create of the singleton).
  await tx.wallet.createMany({
    data: [{ id: PLATFORM_WALLET_ID, kind: "PLATFORM", currency }],
    skipDuplicates: true,
  });
  await lockWallet(tx, PLATFORM_WALLET_ID);
  const platBalances = await getWalletBalances(PLATFORM_WALLET_ID, tx);
  const platAfter = platBalances.grossMinor + amountMinor;
  await tx.ledgerEntry.create({
    data: {
      walletId: PLATFORM_WALLET_ID,
      orderId: null,
      type: "CREDIT",
      reason: "FEE",
      amountMinor,
      balanceAfterMinor: platAfter,
    },
  });
  await tx.wallet.update({
    where: { id: PLATFORM_WALLET_ID },
    data: { cachedBalanceMinor: platAfter },
  });
}

// ---------------------------------------------------------------------------
// GETX Pro subscription
// ---------------------------------------------------------------------------

/**
 * Subscribe to (or extend) GETX Pro for 30 days. Idempotent extend: re-buying
 * while active adds 30 days onto the existing expiry.
 */
export async function subscribePro(
  user: SessionUser,
  now = new Date(),
): Promise<void> {
  const feeMinor = siteConfig.fees.subscription.proMonthlyFeeMinor;

  await db.$transaction(async (tx) => {
    const profile = await tx.sellerProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        wallet: { select: { currency: true } },
      },
    });
    if (!profile) throw new MonetizationServiceError("Seller account not found.");

    const currency = profile.wallet?.currency ?? "USD";
    await chargeSellerToPlatform(
      tx,
      profile.id,
      currency,
      feeMinor,
      "SUBSCRIPTION_FEE",
    );

    const active =
      profile.subscriptionTier === "PRO" &&
      profile.subscriptionExpiresAt != null &&
      profile.subscriptionExpiresAt > now;
    const from =
      active && profile.subscriptionExpiresAt
        ? profile.subscriptionExpiresAt
        : now;
    const subscriptionExpiresAt = new Date(from.getTime() + 30 * DAY_MS);

    await tx.sellerProfile.update({
      where: { id: profile.id },
      data: { subscriptionTier: "PRO", subscriptionExpiresAt },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SUBSCRIPTION_PRO",
        entity: "SellerProfile",
        entityId: profile.id,
        meta: { feeMinor, subscriptionExpiresAt: subscriptionExpiresAt.toISOString() },
      },
    });
  });
}
