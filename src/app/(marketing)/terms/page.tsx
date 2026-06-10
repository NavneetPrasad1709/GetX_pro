import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Read the GETX Terms of Service — eligibility, escrow model, seller/buyer obligations, fees and governing law.`,
};

const LAST_UPDATED = "June 2026";

export default function TermsPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-3xl">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Terms of Service" }]}
        />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-faint">Last updated: {LAST_UPDATED}</p>
        </header>

        <div className="flex flex-col gap-8 font-sans text-[15px] leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Introduction</h2>
            <p>
              Welcome to {siteConfig.name} ({siteConfig.domain}). By creating an account or using
              our platform you agree to these Terms of Service. Please read them carefully — they
              explain your rights and responsibilities when buying or selling on GETX.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Eligibility</h2>
            <p>
              You must be at least 18 years old to use GETX. If you are under 18, a parent or legal
              guardian must create and operate the account on your behalf. By registering you confirm
              that you meet this requirement and that the information you provide is accurate.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">How It Works — Escrow Model</h2>
            <p>
              GETX acts as an escrow agent. When a buyer pays, funds are held securely in escrow
              until the buyer confirms receipt of the item or account. Funds are released to the
              seller only after successful delivery confirmation, or automatically after{" "}
              {siteConfig.escrow.autoReleaseDays} days with no dispute. This protects both parties.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Prohibited Items and Activities</h2>
            <p>
              You may not list or sell any item that violates applicable law, the terms of the
              underlying game publisher, or GETX&apos;s content policy. Prohibited activities
              include fraud, money laundering, impersonation, spam, and any attempt to circumvent
              the escrow system. Violations result in immediate account suspension.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Seller Obligations</h2>
            <p>
              Sellers must accurately describe their listings, deliver items as described within the
              stated time, respond to buyer messages in a timely manner, and complete KYC (identity
              verification) before receiving payouts. Sellers are solely responsible for the
              accuracy of their listings.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Buyer Obligations</h2>
            <p>
              Buyers must pay the listed price plus applicable platform fees at checkout. Once you
              confirm receipt of a delivery, the transaction is considered complete and funds are
              released to the seller. If there is a problem, you must open a dispute before
              confirming receipt.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Dispute Resolution</h2>
            <p>
              If a buyer and seller cannot resolve a disagreement, either party may open a formal
              dispute. GETX&apos;s AI Dispute Judge reviews the evidence and issues a binding
              decision. Both parties agree to accept the outcome. See the{" "}
              <a href="/trust-safety" className="text-primary hover:underline">Trust &amp; Safety</a>{" "}
              page for details.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Platform Fees</h2>
            <p>
              A buyer platform fee of {siteConfig.fees.buyerPlatformFeePercent}% is added at
              checkout. Sellers pay a commission on each completed sale, varying by category. See
              the <a href="/fees" className="text-primary hover:underline">Fees page</a> for the
              complete breakdown.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Limitation of Liability</h2>
            <p>
              {siteConfig.name} is not liable for losses arising from user actions, game publisher
              policy changes, or events outside our control. Our total liability is limited to the
              value of the disputed transaction. We provide the platform; the underlying trade is
              between buyer and seller.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Governing Law</h2>
            <p>
              These Terms are governed by the laws of India. Any disputes arising from these Terms
              shall be subject to the exclusive jurisdiction of the courts of Bangalore, Karnataka.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Contact</h2>
            <p>
              Questions about these Terms? Email us at{" "}
              <a href="mailto:support@getx.live" className="text-primary hover:underline">
                support@getx.live
              </a>{" "}
              or visit our <a href="/contact" className="text-primary hover:underline">Contact page</a>.
            </p>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
