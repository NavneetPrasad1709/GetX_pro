import { z } from "zod";

/**
 * Payout destination input (P1-T1). ONE schema, used by the client form AND
 * re-validated in the server action. The account NUMBER is the only secret —
 * encrypted at rest in the service. Everything is shape-validated here and the
 * conditional requirements (UPI *or* bank for RAZORPAY; network + address for
 * CRYPTO) are enforced via superRefine so the client and server agree.
 */

// UPI VPA, e.g. "name@bank" — letters/digits/dot/hyphen/underscore @ handle.
const UPI_RE = /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/;
// Indian Financial System Code — 4 letters, 0, then 6 alphanumerics.
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{6,20}$/;

export const CRYPTO_NETWORKS = ["USDT-TRC20", "USDT-ERC20", "BTC", "ETH"] as const;

const optional = z.string().trim().max(256).optional().or(z.literal(""));

export const payoutAccountSchema = z
  .object({
    method: z.enum(["RAZORPAY", "CRYPTO"]),
    holderName: z
      .string()
      .trim()
      .min(2, "Enter the account holder's name")
      .max(120, "Name is too long"),
    upiVpa: optional,
    accountNumber: optional,
    ifsc: optional,
    cryptoNetwork: optional,
    walletAddress: optional,
  })
  .superRefine((d, ctx) => {
    if (d.method === "RAZORPAY") {
      const hasUpi = !!d.upiVpa && UPI_RE.test(d.upiVpa);
      const hasBank =
        !!d.accountNumber &&
        ACCOUNT_RE.test(d.accountNumber) &&
        !!d.ifsc &&
        IFSC_RE.test(d.ifsc.toUpperCase());
      if (d.upiVpa && !UPI_RE.test(d.upiVpa)) {
        ctx.addIssue({ code: "custom", path: ["upiVpa"], message: "Enter a valid UPI ID (name@bank)." });
      }
      if (d.accountNumber && !ACCOUNT_RE.test(d.accountNumber)) {
        ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "Account number is 6–20 digits." });
      }
      if (d.ifsc && !IFSC_RE.test(d.ifsc.toUpperCase())) {
        ctx.addIssue({ code: "custom", path: ["ifsc"], message: "Enter a valid IFSC code (e.g. HDFC0001234)." });
      }
      if (!hasUpi && !hasBank) {
        ctx.addIssue({
          code: "custom",
          path: ["upiVpa"],
          message: "Add a UPI ID, or a bank account number + IFSC.",
        });
      }
    } else {
      if (!d.cryptoNetwork || !(CRYPTO_NETWORKS as readonly string[]).includes(d.cryptoNetwork)) {
        ctx.addIssue({ code: "custom", path: ["cryptoNetwork"], message: "Choose a network." });
      }
      if (!d.walletAddress || d.walletAddress.length < 20 || !/^[a-zA-Z0-9]+$/.test(d.walletAddress)) {
        ctx.addIssue({ code: "custom", path: ["walletAddress"], message: "Enter a valid wallet address." });
      }
    }
  });

export type PayoutAccountInput = z.infer<typeof payoutAccountSchema>;
