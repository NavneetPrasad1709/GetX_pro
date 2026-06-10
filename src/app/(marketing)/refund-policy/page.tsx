import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: `GETX Refund Policy — when refunds are issued, how long they take, crypto note, and non-refundable situations.`,
};

const LAST_UPDATED = "June 2026";

export default function RefundPolicyPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-3xl">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Refund Policy" }]}
        />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">
            Refund Policy
          </h1>
          <p className="mt-2 text-sm text-faint">Last updated: {LAST_UPDATED}</p>
        </header>

        <div className="flex flex-col gap-8 font-sans text-[15px] leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">
              The Escrow Model
            </h2>
            <p>
              Every order on GETX is escrow-protected. Your payment is held securely by GETX until
              you confirm successful delivery, or until the{" "}
              {siteConfig.escrow.autoReleaseDays}-day auto-release window passes with no dispute.
              Because funds are never released to the seller until delivery is confirmed, our refund
              rate is very low.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">
              When a Refund Is Issued
            </h2>
            <p>A full refund is automatically issued to the buyer when:</p>
            <ul className="mt-3 ml-5 list-disc space-y-1">
              <li>A dispute is opened and resolved in the buyer&apos;s favour.</li>
              <li>The seller fails to deliver within the stated time frame.</li>
              <li>The item or account is materially different from the listing description.</li>
              <li>The seller does not respond to the dispute within the required window.</li>
            </ul>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">
              How Long Refunds Take
            </h2>
            <p>
              INR refunds via UPI (Razorpay) are typically processed within 3–5 business days after
              the dispute is resolved. Crypto refunds are processed within 1–2 business days at the
              USD-equivalent value at the time of dispute resolution (not the time of original
              payment — crypto exchange rates fluctuate, and this is noted at checkout).
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">
              Crypto Refunds Note
            </h2>
            <p>
              Crypto payments (USDT, BTC, ETH) are converted at the rate provided by CoinGate at
              the time of payment. If a refund is issued, the INR-equivalent is returned (or
              equivalent USDT at current rates). GETX is not responsible for exchange-rate
              fluctuations between payment and refund dates.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">
              Non-Refundable Situations
            </h2>
            <p>Refunds are not available in the following cases:</p>
            <ul className="mt-3 ml-5 list-disc space-y-1">
              <li>
                The buyer clicked &quot;Confirm delivery&quot; — once confirmed, funds are released
                to the seller and the transaction is final.
              </li>
              <li>
                The auto-release window ({siteConfig.escrow.autoReleaseDays} days) passed without
                a dispute being opened by the buyer.
              </li>
              <li>
                The buyer changed their mind about a correctly-delivered item (change of mind is
                not a dispute ground under our policy).
              </li>
            </ul>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Contact</h2>
            <p>
              If you have a question about a specific order, open a dispute from your orders page
              or email{" "}
              <a href="mailto:support@getx.live" className="text-primary hover:underline">
                support@getx.live
              </a>
              .
            </p>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
