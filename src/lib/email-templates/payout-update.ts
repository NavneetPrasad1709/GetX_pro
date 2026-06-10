import { buildEmailHtml, type EmailMessage } from "./layout";

/** Payout paid / failed email (seller). */
export function payoutUpdateEmail(vars: {
  statusLabel: string; // "paid" | "failed"
  amountFormatted: string; // e.g. "₹1,200.00"
  body: string;
  link: string; // relative path to the wallet
}): EmailMessage {
  return {
    subject: `Payout ${vars.statusLabel}: ${vars.amountFormatted} — GETX`,
    html: buildEmailHtml({
      preheader: `Payout of ${vars.amountFormatted} ${vars.statusLabel}`,
      heading: `Payout ${vars.statusLabel}`,
      body: [vars.body, `Amount: ${vars.amountFormatted}`],
      cta: { label: "View wallet", url: vars.link },
    }),
  };
}
