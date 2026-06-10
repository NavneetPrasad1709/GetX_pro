import type { Prisma, LoyaltyPoint, LoyaltyPointReason } from "@prisma/client";
import { db } from "@/lib/db";
import {
  LOYALTY_CONFIG,
  subtotalRedemptionCapPoints,
} from "@/config/loyalty";

/**
 * Loyalty points service (Step 21). Balance is ALWAYS derived (ΣEARN − ΣREDEEM) — never a stored
 * running total (same append-only principle as the money ledger). Points are not money: awards
 * never touch escrow/wallets. `awardPoints`/`redeemPoints` run INSIDE the caller's transaction so
 * they commit atomically with the order/escrow movement.
 */

export class LoyaltyServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoyaltyServiceError";
  }
}

type Client = Prisma.TransactionClient | typeof db;

/** Derived balance = Σ EARN − Σ REDEEM. Pass `tx` to read inside a transaction. */
export async function getLoyaltyBalance(userId: string, client: Client = db): Promise<number> {
  const grouped = await client.loyaltyPoint.groupBy({
    by: ["type"],
    where: { userId },
    _sum: { amount: true },
  });
  let earn = 0;
  let redeem = 0;
  for (const g of grouped) {
    const sum = g._sum.amount ?? 0;
    if (g.type === "EARN") earn += sum;
    else redeem += sum;
  }
  return earn - redeem;
}

export async function getLoyaltyHistory(userId: string, take = 50): Promise<LoyaltyPoint[]> {
  return db.loyaltyPoint.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/**
 * Insert one EARN row inside an existing transaction. Idempotent for order-bound earns via the
 * `@@unique([userId, orderId, reason, type])` index + `skipDuplicates` — so a retried release can
 * never double-award and can never throw a P2002 that would roll back the money movement.
 */
export async function awardPoints(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  reason: LoyaltyPointReason,
  orderId?: string,
): Promise<void> {
  const amt = Math.floor(amount);
  if (amt <= 0) return;
  await tx.loyaltyPoint.createMany({
    data: [{ userId, amount: amt, type: "EARN", reason, orderId: orderId ?? null }],
    skipDuplicates: true,
  });
}

/**
 * Insert one REDEEM row inside the order-creation transaction. Throws if the balance is too low
 * (caller has already server-clamped, so this is a final guard). The unique index makes it
 * one redemption per order.
 */
export async function redeemPoints(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  orderId: string,
): Promise<void> {
  const amt = Math.floor(amount);
  if (amt <= 0) return;
  const balance = await getLoyaltyBalance(userId, tx);
  if (balance < amt) throw new LoyaltyServiceError("Not enough points to redeem.");
  await tx.loyaltyPoint.create({
    data: { userId, amount: amt, type: "REDEEM", reason: "REDEMPTION", orderId },
  });
}

/** Max points redeemable against a subtotal (20% cap). The platform-fee cap is applied at checkout. */
export function computeRedemptionCap(subtotalMinor: number): number {
  return subtotalRedemptionCapPoints(subtotalMinor);
}

/**
 * Award the one-time signup bonus. Idempotent: guarded on an existing SIGNUP_BONUS row (the unique
 * index can't dedupe null-orderId rows). Never throws — a bonus failure must not break signup.
 */
export async function awardSignupBonus(userId: string): Promise<void> {
  try {
    const existing = await db.loyaltyPoint.findFirst({
      where: { userId, reason: "SIGNUP_BONUS" },
      select: { id: true },
    });
    if (existing) return;
    await db.loyaltyPoint.create({
      data: { userId, amount: LOYALTY_CONFIG.SIGNUP_BONUS_POINTS, type: "EARN", reason: "SIGNUP_BONUS" },
    });
  } catch {
    // best-effort — signup must succeed even if the bonus insert races/fails
  }
}
