import Link from "next/link";
import { CheckIcon, ShoppingBagIcon } from "lucide-react";
import { CtaLink } from "@/components/shared/cta-link";
import { PageContainer } from "@/components/shared/page-container";

const PERKS = ["First listing free", "Fast payouts", "CEO dashboard"];

/** Seller acquisition band (v10 ".sellcta") — sellers feel like CEOs. */
export function SellerCta() {
  return (
    <section className="border-t border-border py-10 min-[761px]:py-12 min-[1025px]:py-[62px]">
      <PageContainer>
        <div className="flex flex-col items-start justify-between gap-4 rounded-[20px] border border-primary/40 bg-gradient-to-b from-primary/10 to-primary/[0.04] p-7 min-[761px]:flex-row min-[761px]:flex-wrap min-[761px]:items-center min-[761px]:gap-[30px] min-[901px]:p-10">
          <div>
            {/* text-primary-hover: this kicker sits on the blue-tinted card
                (≈4.3:1 with plain primary) — the lighter shade passes AA. */}
            <span className="font-heading text-xs font-semibold tracking-[0.14em] text-primary-hover uppercase">
              For sellers
            </span>
            <h2 className="mt-2 max-w-[18ch] text-[clamp(22px,3vw,30px)] font-bold">
              Got accounts to sell? Start earning today.
            </h2>
            <p className="mt-2.5 max-w-[46ch] text-[15px] text-muted-foreground">
              Set up in 5 minutes, first listing free. Your own CEO dashboard,
              fast payouts, and AI pricing help.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {PERKS.map((perk) => (
                <span
                  key={perk}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-heading text-[12.5px] font-medium text-foreground"
                >
                  <CheckIcon className="size-3.5 text-primary" aria-hidden="true" />
                  {perk}
                </span>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-col items-start gap-2.5 min-[761px]:w-auto">
            <CtaLink
              href="/become-seller"
              size="lg"
              className="w-full min-[761px]:w-auto"
            >
              <ShoppingBagIcon className="size-[17px]" aria-hidden="true" />
              Start selling — free
            </CtaLink>
            <Link
              href="/fees"
              className="inline-flex items-center rounded-sm px-[18px] py-[11px] font-heading text-[14.5px] font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              See seller fees →
            </Link>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
