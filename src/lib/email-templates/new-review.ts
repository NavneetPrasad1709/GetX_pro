import { buildEmailHtml, type EmailMessage } from "./layout";

/** New review email (seller). */
export function newReviewEmail(vars: {
  rating: number; // 1-5
  listingTitle: string;
  link: string; // relative path to the seller's reviews / listing
}): EmailMessage {
  const stars = "★".repeat(vars.rating) + "☆".repeat(Math.max(0, 5 - vars.rating));
  return {
    subject: `New ${vars.rating}-star review — GETX`,
    html: buildEmailHtml({
      preheader: `${stars} on ${vars.listingTitle}`,
      heading: `You got a ${vars.rating}-star review`,
      body: [
        `${stars}`,
        `A buyer reviewed your sale of "${vars.listingTitle}". Replying to reviews boosts your trust score.`,
      ],
      cta: { label: "View review", url: vars.link },
    }),
  };
}
