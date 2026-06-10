import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheckIcon, BadgeCheckIcon, BotIcon, BarChartIcon } from "lucide-react";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

export const metadata: Metadata = {
  title: "Trust & Safety",
  description: `How GETX keeps buyers and sellers safe — escrow model, KYC verification, AI Dispute Judge, trust scores and prohibited items.`,
};

export default function TrustSafetyPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-3xl">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Trust & Safety" }]} />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">
            Trust &amp; Safety
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            GETX is built around the idea that trust should be structural, not just a badge.
            Here is how the system works.
          </p>
        </header>

        <div className="flex flex-col gap-8 font-sans text-[15px] leading-relaxed text-muted-foreground">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheckIcon className="size-5 text-primary" aria-hidden="true" />
              <h2 className="font-heading text-lg font-bold text-foreground">The Escrow Model</h2>
            </div>
            <p>
              Every transaction on GETX uses escrow. When a buyer pays, funds are held by GETX —
              the seller cannot access them until the buyer confirms delivery. If the buyer
              doesn&apos;t confirm within {siteConfig.escrow.autoReleaseDays} days and no dispute
              is open, the funds auto-release. This makes it structurally impossible for a seller
              to take payment and disappear.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <div className="mb-2 flex items-center gap-2">
              <BadgeCheckIcon className="size-5 text-success" aria-hidden="true" />
              <h2 className="font-heading text-lg font-bold text-foreground">
                ID Verification (KYC)
              </h2>
            </div>
            <p>
              Sellers must complete identity verification before receiving any payout. We check
              a government-issued ID (Aadhaar, PAN, or passport). KYC-approved sellers receive a
              &quot;Verified&quot; badge on every listing. This badge means the person behind the
              account has been positively identified — a level of accountability you won&apos;t
              find on anonymous forums.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <div className="mb-2 flex items-center gap-2">
              <BotIcon className="size-5 text-primary" aria-hidden="true" />
              <h2 className="font-heading text-lg font-bold text-foreground">AI Dispute Judge</h2>
            </div>
            <p>
              When a buyer and seller cannot resolve a disagreement, either party can open a
              formal dispute. Our AI Dispute Judge reviews the conversation history, delivery
              screenshots, and order metadata to reach a fair, evidence-based decision. Disputes
              are typically resolved within 24–48 hours. Both parties agree in advance to accept
              the outcome.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <div className="mb-2 flex items-center gap-2">
              <BarChartIcon className="size-5 text-primary" aria-hidden="true" />
              <h2 className="font-heading text-lg font-bold text-foreground">Trust Score</h2>
            </div>
            <p>
              Every seller has a trust score between 0 and 100. It is computed from completed
              orders, positive reviews, response time, dispute history, and KYC verification.
              Scores are recomputed daily. Buyers can filter marketplace results by minimum trust
              score to see only the most reliable sellers.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Prohibited Items</h2>
            <p>
              GETX does not allow listings for: illegal items, items that violate applicable game
              publisher terms of service in a way that harms other players, account hacks, bots,
              cheats, or any service that constitutes fraud. Violations result in immediate
              suspension and potential referral to authorities.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">
              Reporting a Problem
            </h2>
            <p>
              If you see a suspicious listing or encounter a bad actor, use the &quot;Report&quot;
              button on the listing page. For order-specific issues, open a dispute from your{" "}
              <Link href="/orders" className="text-primary hover:underline">orders page</Link>. For
              anything else, <a href="/contact" className="text-primary hover:underline">contact us</a>.
            </p>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
