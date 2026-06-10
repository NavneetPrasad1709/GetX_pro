import { buildEmailHtml, type EmailMessage } from "./layout";

/** Dispute opened / resolved email. */
export function disputeUpdateEmail(vars: {
  headline: string; // e.g. "A dispute was opened on your order" / "Your dispute was resolved"
  body: string;
  link: string; // relative path to the order
}): EmailMessage {
  return {
    subject: `${vars.headline} — GETX`,
    html: buildEmailHtml({
      preheader: vars.headline,
      heading: vars.headline,
      body: [vars.body],
      cta: { label: "View order", url: vars.link },
    }),
  };
}
