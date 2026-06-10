import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { CtaLink } from "@/components/shared/cta-link";

export const metadata: Metadata = {
  title: "About GETX",
  description: `About GETX — India's escrow-first gaming marketplace. Built for gamers who demand trust, speed and fair prices.`,
};

// Pure static marketing page — no dynamic data (Step 33). Render once, cache forever.
export const revalidate = false;

export default function AboutPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-3xl">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "About" }]} />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">About GETX</h1>
        </header>

        <div className="flex flex-col gap-8 font-sans text-[15px] leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">What We Are</h2>
            <p>
              GETX ({siteConfig.domain}) is a gaming marketplace built in India — a secure,
              AI-powered platform where gamers can buy and sell game accounts, in-game items,
              currency top-ups, and boosting services. Every transaction is escrow-protected, and
              every seller goes through identity verification before receiving payouts.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Why We Built It</h2>
            <p>
              The existing platforms — Eldorado, G2G, PlayerAuctions — serve a global audience
              but treat Indian gamers as an afterthought: no UPI, no INR pricing, no local support.
              We started with Pokémon GO because it&apos;s one of the most active trading
              communities in India, and expanded to Clash of Clans, Valorant, Free Fire, and PUBG
              Mobile. Our strategy: be 10× better at trust and speed in a focused niche, then
              expand.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Our Mission</h2>
            <p>
              Make buying and selling in-game assets safe, fast, and fair for every gamer in India
              — regardless of experience level. We believe the best trust signal isn&apos;t a
              badge; it&apos;s a system that makes scams structurally impossible.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">What Makes GETX Different</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li><span className="font-semibold text-foreground">Escrow on every order</span> — funds never go to the seller until you confirm delivery.</li>
              <li><span className="font-semibold text-foreground">ID-verified sellers</span> — KYC before payouts, so you know who you&apos;re dealing with.</li>
              <li><span className="font-semibold text-foreground">AI Dispute Judge</span> — fast, evidence-based dispute resolution instead of slow human queues.</li>
              <li><span className="font-semibold text-foreground">UPI + crypto</span> — INR via Razorpay and crypto via CoinGate; no Stripe, no hidden FX markup.</li>
              <li><span className="font-semibold text-foreground">Seller-first tools</span> — instant payouts, a real dashboard, and trust scores that reward reliable sellers.</li>
            </ul>
          </section>

          <div className="border-t border-border pt-6 flex flex-wrap gap-3">
            <CtaLink href="/marketplace">Browse marketplace</CtaLink>
            <CtaLink href="/become-seller">Start selling</CtaLink>
          </div>
        </div>
      </PageContainer>
    </main>
  );
}
