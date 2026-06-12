import { type PayoutAccount, type PayoutMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { encrypt, isEncryptionAvailable } from "@/lib/encryption";
import type { PayoutAccountInput } from "@/lib/validators/payout-account";

/**
 * Seller payout destinations (P1-T1). SERVER-SIDE ONLY. The bank account NUMBER
 * is the only secret → AES-256-GCM encrypted at rest (lib/encryption) and never
 * returned in full to any client; the seller + admin only ever see `maskedHint`.
 * A masked, immutable snapshot is written onto the Payout at request time so the
 * admin knows exactly where to send the money and editing the account later
 * can't change an in-flight payout.
 */

export class PayoutAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutAccountError";
  }
}

function maskTail(value: string, keep = 4): string {
  const clean = value.replace(/\s+/g, "");
  return clean.length <= keep ? "••••" : `••••${clean.slice(-keep)}`;
}

/** Human, display-safe label for a saved/snapshotted destination. */
export function payoutAccountLabel(a: {
  method: PayoutMethod;
  upiVpa: string | null;
  ifsc: string | null;
  cryptoNetwork: string | null;
  maskedHint: string;
}): string {
  if (a.method === "CRYPTO") return `${a.cryptoNetwork ?? "Crypto"} · ${a.maskedHint}`;
  if (a.upiVpa) return `UPI · ${a.upiVpa}`;
  return `Bank · ${a.maskedHint}${a.ifsc ? ` · ${a.ifsc}` : ""}`;
}

export type PayoutAccountView = {
  method: PayoutMethod;
  holderName: string;
  label: string;
  maskedHint: string;
};

/** Masked, immutable destination snapshot stored on a Payout (admin pays from this). */
export type PayoutDestinationSnapshot = {
  method: PayoutMethod;
  holderName: string;
  label: string;
  upiVpa: string | null;
  ifsc: string | null;
  cryptoNetwork: string | null;
  walletAddress: string | null; // public on-chain — safe to store/show
  maskedHint: string; // account-number tail only; the full number stays encrypted
};

export function buildDestinationSnapshot(a: PayoutAccount): PayoutDestinationSnapshot {
  return {
    method: a.method,
    holderName: a.holderName,
    label: payoutAccountLabel(a),
    upiVpa: a.upiVpa,
    ifsc: a.ifsc,
    cryptoNetwork: a.cryptoNetwork,
    walletAddress: a.walletAddress,
    maskedHint: a.maskedHint,
  };
}

/** Save (or replace) the seller's single payout destination. */
export async function savePayoutAccount(
  userId: string,
  input: PayoutAccountInput,
): Promise<void> {
  let accountNumberEnc: string | null = null;
  let maskedHint = "••••";
  let upiVpa: string | null = null;
  let ifsc: string | null = null;
  let cryptoNetwork: string | null = null;
  let walletAddress: string | null = null;

  if (input.method === "RAZORPAY") {
    upiVpa = input.upiVpa?.trim() || null;
    ifsc = input.ifsc?.trim().toUpperCase() || null;
    const acct = input.accountNumber?.trim() || null;
    if (acct) {
      // The account number is the secret → encrypt. Fail closed without a key.
      if (!isEncryptionAvailable()) {
        throw new PayoutAccountError(
          "Secure storage is unavailable right now — please try again later.",
        );
      }
      accountNumberEnc = encrypt(acct);
      maskedHint = maskTail(acct);
    } else {
      maskedHint = upiVpa ?? "••••"; // UPI VPA is shareable — fine as the hint
    }
  } else {
    cryptoNetwork = input.cryptoNetwork?.trim() || null;
    walletAddress = input.walletAddress?.trim() || null;
    maskedHint = walletAddress ? maskTail(walletAddress, 6) : "••••";
  }

  const data = {
    method: input.method,
    holderName: input.holderName.trim(),
    upiVpa,
    accountNumberEnc,
    ifsc,
    cryptoNetwork,
    walletAddress,
    maskedHint,
  };

  await db.$transaction(async (tx) => {
    await tx.payoutAccount.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    // Flip the onboarding "payout method set" flag now that a REAL account exists
    // (replaces the old first-payout-request heuristic).
    const profile = await tx.sellerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (profile) {
      await tx.wallet.updateMany({
        where: { sellerProfileId: profile.id },
        data: { payoutMethodSet: true },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "PAYOUT_ACCOUNT_SAVED",
        entity: "PayoutAccount",
        entityId: userId,
        meta: { method: input.method },
      },
    });
  });
}

/** Masked view for the seller's wallet page (never exposes the account number). */
export async function getPayoutAccountView(
  userId: string,
): Promise<PayoutAccountView | null> {
  const a = await db.payoutAccount.findUnique({ where: { userId } });
  if (!a) return null;
  return {
    method: a.method,
    holderName: a.holderName,
    label: payoutAccountLabel(a),
    maskedHint: a.maskedHint,
  };
}
