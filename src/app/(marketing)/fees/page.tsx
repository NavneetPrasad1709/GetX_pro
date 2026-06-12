import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

export const metadata: Metadata = {
  title: "Fees",
  description: `GETX fee schedule — buyer platform fee, seller commission by category, minimum payout, and payment processing.`,
};

export default function FeesPage() {
  const { fees, payouts } = siteConfig;

  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-3xl">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Fees" }]}
        />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">Fees</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            GETX uses a two-sided fee model: buyers pay a small platform fee at checkout, and
            sellers pay a commission on each completed sale. There are no listing fees and no
            hidden charges.
          </p>
        </header>

        <div className="flex flex-col gap-8 font-sans text-[15px] leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-4 font-heading text-lg font-bold text-foreground">Buyer Fee</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Fee</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">When</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-3">Platform fee</td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {fees.buyerPlatformFeePercent}%
                    </td>
                    <td className="px-4 py-3">Added to the listing price at checkout</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-4 py-3">Payment processing</td>
                    <td className="px-4 py-3 font-semibold text-foreground">Pass-through</td>
                    <td className="px-4 py-3">Charged by Razorpay / CoinGate — no GETX markup</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-4 font-heading text-lg font-bold text-foreground">
              Seller Commission (by category)
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Commission</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">When</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    Object.entries(fees.sellerCommissionPercent) as [
                      keyof typeof fees.sellerCommissionPercent,
                      number,
                    ][]
                  ).map(([kind, pct], i) => (
                    <tr key={kind} className={i > 0 ? "border-t border-border" : ""}>
                      <td className="px-4 py-3 capitalize">{kind.toLowerCase()}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{pct}%</td>
                      <td className="px-4 py-3">Deducted from payout on order completion</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13px] text-faint">
              Commission is deducted from the seller payout when the order is marked complete —
              never from the listing price the buyer sees.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-4 font-heading text-lg font-bold text-foreground">Payouts</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Detail</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-3">Minimum withdrawal</td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      ${(payouts.minPayoutMinor / 100).toLocaleString("en-US")}
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-4 py-3">Maximum per request</td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      ${(payouts.maxPayoutMinor / 100).toLocaleString("en-US")}
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-4 py-3">Payout methods</td>
                    <td className="px-4 py-3 font-semibold text-foreground">UPI · Crypto</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-4 py-3">KYC required?</td>
                    <td className="px-4 py-3 font-semibold text-foreground">Yes — before first payout</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-t border-border pt-6">
            <p className="text-[13px] text-faint">
              All fees are computed in minor units (paise) with round-half-up rounding. The fee
              schedule may be updated periodically — the current rates are always shown on this
              page. Questions?{" "}
              <a href="/contact" className="text-primary hover:underline">
                Contact us.
              </a>
            </p>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
