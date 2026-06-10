import Link from "next/link";
import { PageContainer } from "@/components/shared/page-container";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Rating } from "@/components/shared/rating";
import { SellerLevelBadge } from "@/components/shared/seller-level-badge";
import type { SpotlightSeller } from "@/server/services/marketplace";

/**
 * Sponsored "Seller Spotlight" rail (Prompt 15b, Stream 3). Paid placement,
 * explicitly labeled "Sponsored". Pure server component; renders nothing when
 * no slots are active.
 */
export function SellerSpotlight({ sellers }: { sellers: SpotlightSeller[] }) {
  if (sellers.length === 0) return null;

  return (
    <section aria-labelledby="spotlight-heading" className="py-8 min-[761px]:py-10">
      <PageContainer>
        <div className="mb-4 flex items-center gap-2">
          <h2 id="spotlight-heading" className="font-heading text-xl font-bold min-[761px]:text-2xl">
            Seller spotlight
          </h2>
          <span className="rounded-full bg-amber-500/85 px-2 py-0.5 text-[10px] font-bold uppercase text-black">
            Sponsored
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[521px]:grid-cols-3">
          {sellers.map((s) => (
            <Link
              key={s.id}
              href={`/sellers/${s.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <UserAvatar name={s.displayName} image={s.image} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-heading text-sm font-bold">
                    {s.displayName}
                  </span>
                  <SellerLevelBadge level={s.sellerLevel} size="xs" />
                </div>
                {s.ratingCount > 0 ? (
                  <Rating value={s.ratingAvg} count={s.ratingCount} size="sm" className="mt-1" />
                ) : (
                  <span className="mt-1 block text-xs text-muted-foreground">New seller</span>
                )}
                <span className="mt-0.5 block text-xs text-faint">
                  {s.totalSales.toLocaleString("en-IN")} sales
                </span>
              </div>
            </Link>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
