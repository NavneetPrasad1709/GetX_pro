import { buildEmailHtml, type EmailMessage } from "./layout";

/** Order lifecycle email — paid, delivered, completed, refunded. */
export function orderUpdateEmail(vars: {
  statusLabel: string; // human label, e.g. "delivered"
  listingTitle: string;
  body: string; // one-line description of what happened / what to do
  link: string; // relative path to the order
}): EmailMessage {
  return {
    subject: `Your order was ${vars.statusLabel} — GETX`,
    html: buildEmailHtml({
      preheader: `${vars.listingTitle}: ${vars.statusLabel}`,
      heading: `Order ${vars.statusLabel}`,
      body: [vars.body, `Item: ${vars.listingTitle}`],
      cta: { label: "View order", url: vars.link },
    }),
  };
}
