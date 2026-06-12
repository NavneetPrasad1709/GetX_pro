import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

export const metadata: Metadata = {
  title: "Payouts",
  description: `GETX seller payouts — how escrow release works, minimum withdrawal, supported methods, KYC requirement and processing time.`,
};

export default function PayoutsPage() {
  const { payouts, escrow } = siteConfig;
  const minPayoutRupees = (payouts.minPayoutMinor / 100).toLocaleString("en-US");

  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-3xl">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Payouts" }]} />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">Payouts</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            How your earnings move from escrow into your wallet and then to your bank or wallet.
          </p>
        </header>

        <div className="flex flex-col gap-8 font-sans text-[15px] leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">How Payouts Work</h2>
            <p>
              When a buyer confirms delivery of your item, GETX releases the escrowed funds to your
              GETX seller wallet (minus the platform commission). If the buyer does not confirm
              within {escrow.autoReleaseDays} days and no dispute is open, funds auto-release
              automatically. From your wallet you can request a withdrawal at any time.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-4 font-heading text-lg font-bold text-foreground">Payout Details</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">Minimum withdrawal</td>
                    <td className="px-4 py-3 text-muted-foreground">${minPayoutRupees}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-foreground">Auto-release after</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {escrow.autoReleaseDays} days from delivery confirmation
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-foreground">Supported methods</td>
                    <td className="px-4 py-3 text-muted-foreground">UPI (INR) · Crypto (USDT / BTC / ETH)</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-foreground">Processing time</td>
                    <td className="px-4 py-3 text-muted-foreground">1–3 business days after request is approved</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-foreground">KYC required?</td>
                    <td className="px-4 py-3 text-muted-foreground">Yes — complete once from your seller dashboard</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">KYC Requirement</h2>
            <p>
              To protect both buyers and sellers, GETX requires identity verification (KYC) before
              processing any payout. You only need to do this once. Go to{" "}
              <strong className="text-foreground">Seller → KYC</strong> in your dashboard to upload
              your government-issued ID. Approval typically takes 1–2 business days.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <p className="text-[13px] text-faint">
              Questions about a specific payout?{" "}
              <a href="/contact" className="text-primary hover:underline">Contact us</a> or check
              your wallet transaction history in the seller dashboard.
            </p>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
