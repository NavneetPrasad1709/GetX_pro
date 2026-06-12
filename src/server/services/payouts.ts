import {
  Prisma,
  type Payout,
  type PayoutMethod,
  type PayoutStatus,
} from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { getWalletBalances } from "@/server/services/wallet";
import { PLATFORM_WALLET_ID } from "@/server/services/escrow";
import { notifyPayoutEvent } from "@/server/services/notifications";
import { computeInstantPayoutFeeMinor } from "@/lib/fees";
import { siteConfig } from "@/config/site";
import { formatMoney } from "@/lib/money";

/**
 * Seller payouts (Step 14, guardrails §1). SERVER-SIDE ONLY. Balance is ALWAYS
 * derived from the ledger; a withdrawal RESERVES funds by writing a DEBIT/PAYOUT
 * entry inside a wallet-locked transaction, so the same balance can never be
 * withdrawn twice. A failed payout REVERSES the reserve with a CREDIT/PAYOUT.
 *
 * Ledger lifecycle of a withdrawal:
 *   request  → DEBIT  PAYOUT  (available drops immediately = reserved)
 *   PAID     → status only    (money physically left; the DEBIT stands)
 *   FAILED   → CREDIT PAYOUT   (reverse the reserve; available restored)
 *
 * MVP processing = admin-approved (admin marks PAID/FAILED). An automated
 * RazorpayX / CoinGate payout webhook is a drop-in later: it calls the same
 * markPayoutPaid / markPayoutFailed (idempotent CAS), after signature + dedupe.
 */

export class PayoutServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutServiceError";
  }
}

type Tx = Prisma.TransactionClient;
const PENDING: PayoutStatus[] = ["REQUESTED", "PROCESSING"];

async function getSellerWallet(
  userId: string,
): Promise<{ id: string; currency: string } | null> {
  const profile = await db.sellerProfile.findUnique({
    where: { userId },
    select: { wallet: { select: { id: true, currency: true } } },
  });
  return profile?.wallet ?? null;
}

/** Lock a wallet row so concurrent withdrawals serialize (no double-spend). */
async function lockWallet(tx: Tx, walletId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
}

// --- wallet overview --------------------------------------------------------

export type WalletOverview = {
  walletId: string | null;
  currency: string;
  /** withdrawable NOW (already net of escrow holds + reserved payouts) */
  availableMinor: number;
  /** in escrow on paid-but-not-completed orders (not the seller's yet) */
  heldMinor: number;
  /** reserved by in-flight (REQUESTED/PROCESSING) payouts */
  pendingPayoutMinor: number;
};

export async function getWalletOverview(userId: string): Promise<WalletOverview> {
  const wallet = await getSellerWallet(userId);
  if (!wallet) {
    return {
      walletId: null,
      currency: "USD",
      availableMinor: 0,
      heldMinor: 0,
      pendingPayoutMinor: 0,
    };
  }
  const [balances, pending] = await Promise.all([
    getWalletBalances(wallet.id),
    db.payout.aggregate({
      where: { walletId: wallet.id, status: { in: PENDING } },
      _sum: { amountMinor: true },
    }),
  ]);
  return {
    walletId: wallet.id,
    currency: wallet.currency,
    availableMinor: balances.availableMinor,
    heldMinor: balances.heldMinor,
    pendingPayoutMinor: pending._sum.amountMinor ?? 0,
  };
}

// --- ledger history ---------------------------------------------------------

export type LedgerHistoryItem = {
  id: string;
  type: "CREDIT" | "DEBIT";
  reason: string;
  amountMinor: number;
  balanceAfterMinor: number;
  createdAt: string;
  orderId: string | null;
};

export type LedgerFilter = "all" | "credits" | "debits";

export async function getLedgerHistory(
  userId: string,
  opts: { cursor?: string; filter?: LedgerFilter; limit?: number } = {},
): Promise<{ items: LedgerHistoryItem[]; nextCursor: string | null }> {
  const wallet = await getSellerWallet(userId);
  if (!wallet) return { items: [], nextCursor: null };

  const take = Math.min(Math.max(1, opts.limit ?? 20), 50);
  const where: Prisma.LedgerEntryWhereInput = { walletId: wallet.id };
  if (opts.filter === "credits") where.type = "CREDIT";
  if (opts.filter === "debits") where.type = "DEBIT";

  const rows = await db.ledgerEntry.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      reason: true,
      amountMinor: true,
      balanceAfterMinor: true,
      createdAt: true,
      orderId: true,
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    items: page.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

// --- request a payout (reserve funds) ---------------------------------------

export async function requestPayout(
  userId: string,
  amountMinor: number,
  method: PayoutMethod,
  isInstant = false,
): Promise<Payout> {
  const { minPayoutMinor, maxPayoutMinor } = siteConfig.payouts;
  const instantFeeMinor = isInstant
    ? computeInstantPayoutFeeMinor(amountMinor)
    : 0;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new PayoutServiceError("Enter a valid amount.");
  }
  if (amountMinor < minPayoutMinor) {
    throw new PayoutServiceError(
      `Minimum withdrawal is ${formatMoney(minPayoutMinor)}.`,
    );
  }
  if (amountMinor > maxPayoutMinor) {
    throw new PayoutServiceError(
      `You can withdraw at most ${formatMoney(maxPayoutMinor)} at once.`,
    );
  }

  return db.$transaction(async (tx) => {
    const profile = await tx.sellerProfile.findUnique({
      where: { userId },
      select: { payoutHeldAt: true, wallet: { select: { id: true } } },
    });
    // Fraud auto-action guard (Prompt 16): a held seller cannot withdraw. Fail
    // closed — any doubt blocks the payout.
    if (profile?.payoutHeldAt) {
      throw new PayoutServiceError(
        "Your payouts are temporarily on hold pending a security review. " +
          "Please contact support@getx.live.",
      );
    }
    const walletId = profile?.wallet?.id;
    if (!walletId) {
      throw new PayoutServiceError("You don't have any earnings to withdraw yet.");
    }

    // Lock FIRST, THEN read available inside the lock — two concurrent requests
    // serialize, so the second sees the reduced balance and can't double-spend.
    await lockWallet(tx, walletId);
    const balances = await getWalletBalances(walletId, tx);
    // Instant payout fee (Prompt 15b) is debited on TOP of the amount, so the
    // available balance must cover both.
    if (amountMinor + instantFeeMinor > balances.availableMinor) {
      throw new PayoutServiceError(
        `That's more than your available balance (${formatMoney(balances.availableMinor)})${
          instantFeeMinor > 0 ? ` after the ${formatMoney(instantFeeMinor)} instant fee` : ""
        }.`,
      );
    }

    let runningGross = balances.grossMinor - amountMinor;
    await tx.ledgerEntry.create({
      data: {
        walletId,
        type: "DEBIT",
        reason: "PAYOUT",
        amountMinor,
        balanceAfterMinor: runningGross,
      },
    });

    // Instant fee: DEBIT the seller + CREDIT the PLATFORM wallet, same tx.
    if (instantFeeMinor > 0) {
      runningGross -= instantFeeMinor;
      await tx.ledgerEntry.create({
        data: {
          walletId,
          type: "DEBIT",
          reason: "INSTANT_PAYOUT_FEE",
          amountMinor: instantFeeMinor,
          balanceAfterMinor: runningGross,
        },
      });
      await tx.wallet.createMany({
        data: [{ id: PLATFORM_WALLET_ID, kind: "PLATFORM", currency: "USD" }],
        skipDuplicates: true,
      });
      await lockWallet(tx, PLATFORM_WALLET_ID);
      const plat = await getWalletBalances(PLATFORM_WALLET_ID, tx);
      const platAfter = plat.grossMinor + instantFeeMinor;
      await tx.ledgerEntry.create({
        data: {
          walletId: PLATFORM_WALLET_ID,
          type: "CREDIT",
          reason: "FEE",
          amountMinor: instantFeeMinor,
          balanceAfterMinor: platAfter,
        },
      });
      await tx.wallet.update({
        where: { id: PLATFORM_WALLET_ID },
        data: { cachedBalanceMinor: platAfter },
      });
    }

    await tx.wallet.update({
      where: { id: walletId },
      // First payout request flips payoutMethodSet → checks the onboarding
      // checklist step (Prompt 14). Idempotent: harmless to re-set true.
      data: { cachedBalanceMinor: runningGross, payoutMethodSet: true },
    });
    const payout = await tx.payout.create({
      data: { walletId, amountMinor, method, status: "REQUESTED", isInstant, instantFeeMinor },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "PAYOUT_REQUESTED",
        entity: "Payout",
        entityId: payout.id,
        meta: { amountMinor, method, isInstant, instantFeeMinor },
      },
    });
    return payout;
  });
}

// --- seller's payout history ------------------------------------------------

export type PayoutRow = {
  id: string;
  amountMinor: number;
  method: PayoutMethod;
  status: PayoutStatus;
  createdAt: string;
};

export async function getMyPayouts(
  userId: string,
  limit = 20,
): Promise<PayoutRow[]> {
  const wallet = await getSellerWallet(userId);
  if (!wallet) return [];
  const rows = await db.payout.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      amountMinor: true,
      method: true,
      status: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// --- admin: list + process payouts (also reused by a future payout webhook) -

export type AdminPayoutRow = {
  id: string;
  amountMinor: number;
  method: PayoutMethod;
  status: PayoutStatus;
  currency: string;
  createdAt: string;
  sellerId: string;
  sellerName: string;
  isInstant: boolean;
};

export async function listPayouts(
  statuses: PayoutStatus[] = PENDING,
): Promise<AdminPayoutRow[]> {
  const rows = await db.payout.findMany({
    where: { status: { in: statuses } },
    orderBy: { createdAt: "asc" }, // FIFO — oldest requests first
    select: {
      id: true,
      amountMinor: true,
      method: true,
      status: true,
      isInstant: true,
      createdAt: true,
      wallet: {
        select: {
          currency: true,
          sellerProfile: { select: { id: true, displayName: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    amountMinor: r.amountMinor,
    method: r.method,
    status: r.status,
    currency: r.wallet.currency,
    createdAt: r.createdAt.toISOString(),
    sellerId: r.wallet.sellerProfile?.id ?? "",
    sellerName: r.wallet.sellerProfile?.displayName ?? "Unknown",
    isInstant: r.isInstant,
  }));
}

/**
 * Mark a payout PAID (money sent). Idempotent CAS — only a REQUESTED/PROCESSING
 * payout moves; a replay is a no-op. The reserve DEBIT was written at request,
 * so PAID needs no ledger change.
 */
export async function markPayoutPaid(
  actorId: string,
  payoutId: string,
  providerRef?: string,
): Promise<"updated" | "noop"> {
  const result = await db.$transaction(async (tx) => {
    const moved = await tx.payout.updateMany({
      where: { id: payoutId, status: { in: PENDING } },
      data: { status: "PAID", ...(providerRef ? { providerRef } : {}) },
    });
    if (moved.count === 0) return "noop";
    await tx.auditLog.create({
      data: {
        actorId,
        action: "PAYOUT_PAID",
        entity: "Payout",
        entityId: payoutId,
        meta: providerRef ? { providerRef } : {},
      },
    });
    return "updated";
  });
  // Step 22: notify the seller their money is on the way (post-commit, never blocks).
  if (result === "updated") {
    void notifyPayoutEvent(payoutId, "PAID").catch(captureException);
  }
  return result;
}

/**
 * Mark a payout FAILED and REVERSE the reserve with a CREDIT/PAYOUT. Idempotent
 * CAS — only a REQUESTED/PROCESSING payout moves, so the reversal is written
 * exactly once (a replay can never double-credit the seller).
 */
export async function markPayoutFailed(
  actorId: string,
  payoutId: string,
  reason: string,
): Promise<"updated" | "noop"> {
  const result = await db.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({
      where: { id: payoutId },
      select: { id: true, walletId: true, amountMinor: true },
    });
    if (!payout) throw new PayoutServiceError("Payout not found.");

    const moved = await tx.payout.updateMany({
      where: { id: payoutId, status: { in: PENDING } },
      data: { status: "FAILED" },
    });
    if (moved.count === 0) return "noop"; // already PAID/FAILED → never re-reverse

    await lockWallet(tx, payout.walletId);
    const balances = await getWalletBalances(payout.walletId, tx);
    const balanceAfterMinor = balances.grossMinor + payout.amountMinor;
    await tx.ledgerEntry.create({
      data: {
        walletId: payout.walletId,
        type: "CREDIT",
        reason: "PAYOUT",
        amountMinor: payout.amountMinor,
        balanceAfterMinor,
      },
    });
    await tx.wallet.update({
      where: { id: payout.walletId },
      data: { cachedBalanceMinor: balanceAfterMinor },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "PAYOUT_FAILED",
        entity: "Payout",
        entityId: payoutId,
        meta: { reason, reversedMinor: payout.amountMinor },
      },
    });
    return "updated";
  });
  // Step 22: notify the seller the payout failed (funds returned to balance).
  if (result === "updated") {
    void notifyPayoutEvent(payoutId, "FAILED").catch(captureException);
  }
  return result;
}
