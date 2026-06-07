import { HeaderSearch } from "@/components/layout/header-search";
import { TrustBadge } from "@/components/shared/trust-badge";
import { PageContainer } from "@/components/shared/page-container";

/** v10 hero social proof — avatar stack initials + tones. */
const PROOF_AVATARS = [
  { initial: "A", bg: "#4d7cfe", fg: "#fff" },
  { initial: "R", bg: "#45b483", fg: "#fff" },
  { initial: "S", bg: "#f0b429", fg: "#241a02" },
  { initial: "K", bg: "#ff5a76", fg: "#fff" },
  { initial: "M", bg: "#8b5cf6", fg: "#fff" },
];

/**
 * Homepage hero (v10) — aurora + grid backdrop, live rating pill, gradient
 * headline, game-scoped search, glass trust badges and social proof.
 * Server-rendered and static so the LCP headline paints immediately.
 */
export function HomeHero() {
  return (
    <section className="relative overflow-hidden pt-9 pb-10 text-center min-[761px]:pt-[74px] min-[761px]:pb-[60px]">
      {/* ambient depth: blue aurora + faint grid (v10 .hero-bg) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute top-[-14%] left-1/2 h-[66vh] w-[78vw] -translate-x-1/2 rounded-full blur-[88px]"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgba(77,124,254,.28), rgba(69,180,131,.11) 46%, transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0 mask-[radial-gradient(ellipse_72%_62%_at_50%_22%,#000,transparent_76%)]"
          style={{
            backgroundSize: "54px 54px",
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.03) 1px, transparent 1px)",
          }}
        />
      </div>

      <PageContainer className="relative z-10">
        {/* live + rating pill */}
        <span className="inline-flex items-center gap-[9px] rounded-full border border-border bg-white/[0.04] px-3 py-1.5 font-heading text-[11.5px] font-medium text-muted-foreground backdrop-blur-[10px] min-[761px]:px-[15px] min-[761px]:text-[12.5px]">
          <span className="size-[7px] rounded-full bg-success animate-live-dot" />
          Live
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span className="text-star" aria-hidden="true">
            ★
          </span>
          <span>
            <b className="font-bold text-foreground">4.9</b>/5 from{" "}
            <b className="font-bold text-foreground">12,400+</b> gamers
          </span>
        </span>

        <h1 className="mx-auto mt-4 max-w-[17ch] text-[clamp(28px,8vw,40px)] font-extrabold tracking-[-0.03em] min-[431px]:text-[clamp(33px,5.4vw,54px)] min-[761px]:mt-[22px]">
          Buy &amp; sell game accounts,{" "}
          <span className="bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
            safely
          </span>
          .
        </h1>

        <p className="mx-auto mt-3 max-w-[46ch] text-[clamp(15px,1.8vw,18px)] text-muted-foreground min-[761px]:mt-4">
          Pay safely, get it instantly, and we hold the money in escrow until
          you&apos;re happy.
        </p>

        <HeaderSearch className="mx-auto mt-[22px] max-w-[640px] min-[761px]:mt-8" />

        {/* glass trust badges */}
        <div className="mt-5 flex flex-wrap justify-center gap-2 min-[761px]:mt-6 min-[761px]:gap-2.5">
          <TrustBadge variant="escrow" />
          <TrustBadge variant="verified" />
          <TrustBadge variant="moneyback" />
          <TrustBadge variant="instant" />
        </div>

        {/* social proof — avatar stack + counts */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-[11px] min-[761px]:mt-7 min-[761px]:gap-3.5">
          <div className="flex" aria-hidden="true">
            {PROOF_AVATARS.map(({ initial, bg, fg }, i) => (
              <span
                key={initial}
                className={
                  "grid size-8 place-items-center rounded-full border-2 border-background font-heading text-xs font-bold min-[761px]:size-9 min-[761px]:text-[13px] " +
                  (i > 0 ? "-ml-2.5 min-[761px]:-ml-[11px]" : "")
                }
                style={{ background: bg, color: fg }}
              >
                {initial}
              </span>
            ))}
          </div>
          <div className="text-left font-heading text-xs leading-normal text-muted-foreground min-[761px]:text-[13.5px]">
            <div>
              <span
                className="mr-[5px] tracking-[1.5px] text-star"
                aria-hidden="true"
              >
                ★★★★★
              </span>
              <b className="font-semibold text-foreground">4.9</b> ·{" "}
              <b className="font-semibold text-foreground">50,000+</b> safe
              trades
            </div>
            <div>
              Trusted by{" "}
              <b className="font-semibold text-foreground">12,400+</b> gamers ·{" "}
              <b className="font-semibold text-foreground">₹2Cr+</b> protected
              in escrow
            </div>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
