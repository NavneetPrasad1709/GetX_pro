import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

export const metadata: Metadata = {
  title: "Help Center",
  description: `GETX Help Center — FAQs on escrow, payments, delivery, disputes, becoming a seller and withdrawing earnings.`,
};

const FAQS = [
  {
    q: "How does escrow work?",
    a: `When you pay for a listing, your money is held securely by GETX — the seller cannot access it yet. Once you confirm you received the item, we release the funds to the seller. If there's a problem, open a dispute before confirming and we step in to resolve it.`,
  },
  {
    q: "How do I pay?",
    a: `GETX supports UPI and Razorpay for INR payments, and crypto (USDT, BTC, ETH) via CoinGate. You choose your preferred method at checkout. Razorpay covers most Indian debit/credit cards and net banking as well.`,
  },
  {
    q: "What happens if the seller doesn't deliver?",
    a: `Open a dispute from your orders page. Our AI Dispute Judge reviews the evidence (chat messages, delivery screenshots). If the seller can't prove delivery, you get a full refund. Disputes are usually resolved within 24–48 hours.`,
  },
  {
    q: "How long until I receive my item?",
    a: `Instant delivery listings are fulfilled within minutes — the seller provides account details or item codes automatically after payment. Manual delivery listings have a window agreed at listing time, typically 1–24 hours.`,
  },
  {
    q: "How do I become a seller?",
    a: `Click "Start selling" in the header, create your account, and apply for the seller role. You'll complete a quick profile setup and KYC verification before your listings go live.`,
  },
  {
    q: "How do I withdraw my earnings?",
    a: `Go to your Seller Wallet in the dashboard and request a withdrawal. The minimum is $${(siteConfig.payouts.minPayoutMinor / 100).toLocaleString("en-US")}. Funds are paid via UPI or crypto, usually within 1–3 business days after KYC approval.`,
  },
  {
    q: "Is my account and payment information safe?",
    a: `Yes. Passwords are bcrypt-hashed, we never store card numbers, and all API traffic is TLS-encrypted. KYC documents are stored in a private encrypted bucket. We use Cloudflare for DDoS protection and Turnstile for bot prevention.`,
  },
];

export default function HelpPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-3xl">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Help Center" }]} />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">Help Center</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Common questions about buying, selling, and using GETX. Can&apos;t find your answer?{" "}
            <a href="/contact" className="text-primary hover:underline">Contact us.</a>
          </p>
        </header>

        <div className="flex flex-col divide-y divide-border">
          {FAQS.map(({ q, a }) => (
            <div key={q} className="py-5">
              <h2 className="mb-2 font-heading text-base font-bold text-foreground">{q}</h2>
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-border bg-muted/30 p-5">
          <p className="text-sm font-semibold text-foreground">Still need help?</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Email us at{" "}
            <a href="mailto:support@getx.live" className="text-primary hover:underline">
              support@getx.live
            </a>{" "}
            or join the{" "}
            <a
              href="https://discord.gg/getx"
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary hover:underline"
            >
              GETX Discord
            </a>{" "}
            for community support.
          </p>
        </div>
      </PageContainer>
    </main>
  );
}
