import type { Metadata } from "next";
import { ShieldCheckIcon, PackageCheckIcon, BanknoteIcon } from "lucide-react";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { CtaLink } from "@/components/shared/cta-link";

export const metadata: Metadata = {
  title: "How It Works",
  description: `Learn how GETX works — escrow-protected buying, instant delivery, and secure seller payouts in 3 simple steps.`,
};

// Pure static marketing page — no dynamic data (Step 33). Render once, cache forever.
export const revalidate = false;

const BUYER_STEPS = [
  {
    icon: ShieldCheckIcon,
    step: "1",
    title: "Browse & Pay",
    body: "Find the listing you want and pay via UPI or crypto. Your payment goes into escrow — it's held securely by GETX and the seller can't touch it yet.",
  },
  {
    icon: PackageCheckIcon,
    step: "2",
    title: "Seller Delivers",
    body: "The seller delivers your item, account, or in-game service. For instant listings this happens within minutes. Manual listings have an agreed delivery window.",
  },
  {
    icon: BanknoteIcon,
    step: "3",
    title: "Confirm & Funds Release",
    body: "Once you confirm delivery, GETX releases the funds to the seller. If anything is wrong, open a dispute before confirming and our AI Dispute Judge reviews the case.",
  },
];

const SELLER_STEPS = [
  { step: "1", title: "List your item", body: "Create a listing in under 5 minutes — set your price, upload screenshots, and choose instant or manual delivery." },
  { step: "2", title: "Buyer pays", body: "When a buyer pays, you receive a notification. Funds are held in escrow while you prepare the delivery." },
  { step: "3", title: "Deliver & get paid", body: "Deliver the item or account details. Once the buyer confirms, your earnings are credited to your GETX wallet. Withdraw anytime above the minimum payout." },
];

export default function HowItWorksPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-3xl">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "How It Works" }]} />

        <header className="mt-6 mb-10">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">
            How It Works
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            GETX is built on escrow-first trust. Every order is protected — whether you are buying
            or selling.
          </p>
        </header>

        {/* For Buyers */}
        <section className="mb-10">
          <h2 className="mb-6 font-heading text-xl font-bold">For Buyers</h2>
          <ol className="flex flex-col gap-5">
            {BUYER_STEPS.map(({ icon: Icon, step, title, body }) => (
              <li key={step} className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-heading font-bold">
                  {step}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    <h3 className="font-heading font-bold text-foreground">{title}</h3>
                  </div>
                  <p className="text-[14.5px] text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <CtaLink href="/marketplace">Browse listings</CtaLink>
          </div>
        </section>

        <section className="border-t border-border pt-8">
          <h2 className="mb-6 font-heading text-xl font-bold">For Sellers</h2>
          <ol className="flex flex-col gap-5">
            {SELLER_STEPS.map(({ step, title, body }) => (
              <li key={step} className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success font-heading font-bold">
                  {step}
                </div>
                <div>
                  <h3 className="mb-1 font-heading font-bold text-foreground">{title}</h3>
                  <p className="text-[14.5px] text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <CtaLink href="/become-seller">Start selling — free</CtaLink>
          </div>
        </section>
      </PageContainer>
    </main>
  );
}
