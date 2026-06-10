import { StarIcon } from "lucide-react";
import { PageContainer } from "@/components/shared/page-container";
import { SectionHeading } from "@/components/shared/section-heading";

/**
 * DORMANT — NOT rendered on the homepage. Pre-launch we show no fabricated
 * social proof (see docs/audit/UX_UI_AUDIT_REPORT.md). This component is wired
 * back in at Step 13 once REAL buyer reviews exist; the sample data below is a
 * layout placeholder only and must be replaced with live data before use.
 */
const REVIEWS: { quote: string; initials: string; name: string; meta: string }[] =
  [
    {
      quote:
        '"Bought a Pokémon GO account, got it in 2 minutes. Escrow made me feel totally safe — no fear of scam."',
      initials: "Rk",
      name: "Rohit K.",
      meta: "Verified buyer · Delhi",
    },
    {
      quote:
        '"As a seller, payouts are quick and the dashboard is clean. Finally a platform that treats sellers well."',
      initials: "An",
      name: "Aniket N.",
      meta: "Verified seller · Pune",
    },
    {
      quote:
        '"Had a small issue, raised a dispute, sorted in minutes with full refund. Support is genuinely fast."',
      initials: "Sm",
      name: "Simran M.",
      meta: "Verified buyer · Mumbai",
    },
  ];

/** "Loved by gamers" band — centered heading + three review cards. */
export function HomeReviews() {
  return (
    <section className="border-t border-border py-10 min-[761px]:py-12 min-[1025px]:py-[62px]">
      <PageContainer>
        {/* description prop removed — will be populated with real aggregate data at Step 13 */}
        <SectionHeading
          align="center"
          kicker="Reviews"
          title="Loved by gamers"
          className="mb-5 min-[761px]:mb-7"
        />

        <div className="grid gap-3.5 min-[761px]:grid-cols-3 min-[761px]:gap-[18px]">
          {REVIEWS.map((review) => (
            <figure
              key={review.name}
              className="rounded-lg border border-border bg-card p-5 min-[761px]:p-6"
            >
              <div
                className="mb-3 inline-flex gap-0.5 text-star"
                role="img"
                aria-label="Rated 5 out of 5 stars"
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <StarIcon key={i} className="size-4 fill-current" aria-hidden="true" />
                ))}
              </div>
              <blockquote className="text-[14.5px] leading-relaxed text-foreground">
                {review.quote}
              </blockquote>
              <figcaption className="mt-4 flex items-center gap-2.5">
                <span
                  className="grid size-[34px] place-items-center rounded-full border border-border bg-secondary font-heading text-[13px] font-bold text-muted-foreground"
                  aria-hidden="true"
                >
                  {review.initials}
                </span>
                <span className="flex flex-col">
                  <span className="font-heading text-[13.5px] font-semibold">
                    {review.name}
                  </span>
                  <span className="text-xs text-faint">{review.meta}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
