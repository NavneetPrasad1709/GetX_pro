import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { CtaLink } from "@/components/shared/cta-link";

export const metadata: Metadata = {
  title: "Seller Guide",
  description: `GETX Seller Guide — how to register, create listings, deliver items, build your trust score, and withdraw your earnings.`,
};

export default function SellerGuidePage() {
  const { fees, payouts } = siteConfig;

  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-3xl">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Seller Guide" }]} />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">Seller Guide</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Everything you need to know to start selling on GETX — from your first listing to
            your first payout.
          </p>
        </header>

        <div className="flex flex-col gap-8 font-sans text-[15px] leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Getting Started</h2>
            <ol className="ml-5 list-decimal space-y-2">
              <li>Register for a GETX account (email + password).</li>
              <li>Apply for the seller role from your dashboard settings.</li>
              <li>Complete KYC — upload your government-issued ID. Required before payouts.</li>
              <li>Set up your seller profile: display name, bio, and country.</li>
              <li>Create your first listing (see below).</li>
            </ol>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Creating Your First Listing</h2>
            <p>
              Go to <strong className="text-foreground">Seller → My listings → New listing</strong>.
              Choose the game and category (account, item, currency, boosting), set your price in
              INR, and select delivery type. Upload clear screenshots. Write an accurate, detailed
              description — buyers who feel informed convert better and leave better reviews.
            </p>
            <p className="mt-2">
              For instant delivery listings, prepare your delivery instructions in advance (account
              credentials or item codes) — buyers expect delivery within minutes.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Delivery Best Practices</h2>
            <ul className="ml-5 list-disc space-y-1">
              <li>Deliver within the time frame stated in your listing.</li>
              <li>Use the GETX chat system for all communication — it protects you in disputes.</li>
              <li>Send a delivery confirmation message after handing over the item/account.</li>
              <li>Never ask the buyer to confirm outside GETX — this waives your protection.</li>
            </ul>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Trust Score Explained</h2>
            <p>
              Your trust score starts at 50 and moves between 0 and 100 based on completed orders,
              positive reviews, response time, dispute outcomes, and KYC verification. A higher
              trust score means your listings appear higher in search results and attract more
              buyers. Sellers with KYC approval get a &quot;Verified&quot; badge on every listing.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Commission &amp; Fees</h2>
            <div className="overflow-x-auto rounded-lg border border-border mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.entries(fees.sellerCommissionPercent) as [string, number][]).map(
                    ([kind, pct], i) => (
                      <tr key={kind} className={i > 0 ? "border-t border-border" : ""}>
                        <td className="px-4 py-3 capitalize">{kind.toLowerCase()}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{pct}%</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[13px] text-faint">
              See the full <a href="/fees" className="text-primary hover:underline">Fees page</a> for
              buyer fee and payout details.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Payouts Explained</h2>
            <p>
              After an order is completed (buyer confirms delivery or the{" "}
              {siteConfig.escrow.autoReleaseDays}-day auto-release passes), your earnings are
              credited to your GETX wallet. Withdraw anytime the balance exceeds $
              {(payouts.minPayoutMinor / 100).toLocaleString("en-US")} via UPI or crypto. See the{" "}
              <a href="/payouts" className="text-primary hover:underline">Payouts page</a> for
              full details.
            </p>
          </section>

          <div className="border-t border-border pt-6">
            <CtaLink href="/become-seller">Start selling — free</CtaLink>
          </div>
        </div>
      </PageContainer>
    </main>
  );
}
