import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Wallet balance math (guardrails §1) — the ledger is the ONLY truth.
 *
 * Three numbers, all derived from LedgerEntry rows:
 *   gross     = ΣCREDIT − ΣDEBIT          (everything that ever moved)
 *   held      = ΣCREDIT(ESCROW_HOLD) − ΣDEBIT(ESCROW_RELEASE | REFUND)
 *               (escrowed money sitting on the wallet that is NOT the
 *                seller's yet — Step 09 writes the holds; Step 10 closes
 *                them with ESCROW_RELEASE on completion or REFUND on dispute)
 *   available = gross − held              (what the seller can withdraw)
 *
 * Worked example (docs/FEES.md, ₹1,000 account sale):
 *   PAID      → CREDIT ESCROW_HOLD 1050            gross 1050, held 1050, avail 0
 *   COMPLETED → DEBIT ESCROW_RELEASE 1050,
 *               CREDIT SALE 920 (Step 10)          gross  920, held    0, avail 920
 *   REFUNDED  → DEBIT REFUND 1050 (Step 10)        gross    0, held    0, avail 0
 */

export type WalletBalances = {
  availableMinor: number;
  heldMinor: number;
  grossMinor: number;
};

/**
 * `client` lets callers pass a transaction client (`tx`) so the balance is read
 * INSIDE the same transaction/lock — required by payout reservation (Step 14),
 * which locks the wallet row before checking + debiting available funds.
 */
export async function getWalletBalances(
  walletId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<WalletBalances> {
  const groups = await client.ledgerEntry.groupBy({
    by: ["type", "reason"],
    where: { walletId },
    _sum: { amountMinor: true },
  });

  let credit = 0;
  let debit = 0;
  let holdOpened = 0;
  let holdClosed = 0;

  for (const g of groups) {
    const sum = g._sum.amountMinor ?? 0;
    if (g.type === "CREDIT") {
      credit += sum;
      if (g.reason === "ESCROW_HOLD") holdOpened += sum;
    } else {
      debit += sum;
      if (g.reason === "ESCROW_RELEASE" || g.reason === "REFUND") {
        holdClosed += sum;
      }
    }
  }

  const grossMinor = credit - debit;
  const heldMinor = Math.max(0, holdOpened - holdClosed);
  return { grossMinor, heldMinor, availableMinor: grossMinor - heldMinor };
}
