"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { LockIcon, SearchIcon, ShoppingBagIcon } from "lucide-react";
import { Logo, socialIcons } from "@/components/shared/icons";
import { footerNav, socials } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Cinematic footer v10.1 — normal document flow (no fixed/clip-path curtain),
// so sections can NEVER overlap: marquee strip → CTA → link columns → bottom.
// Only the decorative layers (aurora, grid, giant wordmark) sit behind content.
// ---------------------------------------------------------------------------
const STYLES = `
@keyframes cine-breathe{0%{transform:translate(-50%,-50%) scale(1);opacity:.55}100%{transform:translate(-50%,-50%) scale(1.12);opacity:1}}
@keyframes cine-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes cine-beat{0%,100%{transform:scale(1)}15%,45%{transform:scale(1.25)}30%{transform:scale(1)}}

.cine-aurora{position:absolute;left:50%;top:50%;height:120%;width:80vw;transform:translate(-50%,-50%);border-radius:50%;filter:blur(80px);pointer-events:none;
  background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--primary) 20%,transparent) 0%,color-mix(in srgb,var(--success) 12%,transparent) 42%,transparent 70%);
  animation:cine-breathe 8s ease-in-out infinite alternate}

.cine-marquee-track{display:flex;width:max-content;animation:cine-scroll 40s linear infinite;font-family:var(--font-display);font-size:12.5px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--muted-foreground)}
.cine-marquee-item{display:flex;align-items:center;gap:46px;padding:0 23px}
.cine-marquee-item .sx{color:var(--primary)} .cine-marquee-item .sx.alt{color:var(--success)}

/* giant GETX watermark — sits in normal flow at the very END of the footer,
   bottom-cropped by its overflow-hidden wrapper (no overlap possible) */
.cine-giant-wrap{overflow:hidden;display:flex;justify-content:center;pointer-events:none;user-select:none;margin-top:8px}
.cine-giant{white-space:nowrap;font-family:var(--font-display);font-size:clamp(90px,22vw,300px);line-height:.75;font-weight:800;letter-spacing:-.04em;transform:translateY(22%);
  background:linear-gradient(180deg,rgba(255,255,255,.10) 0%,rgba(255,255,255,.015) 78%,transparent 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
  -webkit-text-stroke:1px rgba(255,255,255,.05)}

.cine-heading{background:linear-gradient(180deg,var(--foreground) 0%,color-mix(in srgb,var(--foreground) 45%,transparent) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 0 22px rgba(255,255,255,.12))}

/* magnetic glass pills */
.glass-pill{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:11px;border-radius:999px;font-family:var(--font-display);font-weight:600;text-align:center;color:var(--foreground);
  background:linear-gradient(145deg,rgba(255,255,255,.05),rgba(255,255,255,.015));border:1px solid rgba(255,255,255,.09);
  box-shadow:0 10px 30px -10px rgba(0,0,0,.6),inset 0 1px 1px rgba(255,255,255,.08);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  transition:background .3s,border-color .3s,box-shadow .3s,color .3s;will-change:transform}
.glass-pill:hover{background:linear-gradient(145deg,rgba(255,255,255,.10),rgba(255,255,255,.03));border-color:color-mix(in srgb,var(--primary) 45%,transparent);box-shadow:0 22px 44px -12px rgba(0,0,0,.7),inset 0 1px 1px rgba(255,255,255,.16)}
.glass-pill.lg{padding:16px 30px;font-size:15px}
.glass-pill.primary{background:linear-gradient(145deg,color-mix(in srgb,var(--primary-hover) 95%,transparent),color-mix(in srgb,var(--primary) 70%,transparent));border-color:color-mix(in srgb,var(--primary-hover) 55%,transparent);color:#fff;box-shadow:0 14px 34px -10px color-mix(in srgb,var(--primary) 60%,transparent),inset 0 1px 1px rgba(255,255,255,.25)}
.glass-pill.primary:hover{background:linear-gradient(145deg,#6e95ff,#5181ff);border-color:color-mix(in srgb,var(--primary-hover) 70%,transparent)}
.glass-pill svg{width:20px;height:20px}
@media(max-width:760px){.glass-pill.lg{width:100%}}

.cine-heart{color:var(--destructive);font-size:14px;display:inline-block;animation:cine-beat 2s cubic-bezier(.25,1,.5,1) infinite}

@media (prefers-reduced-motion: reduce){
  .cine-aurora,.cine-marquee-track,.cine-heart{animation:none}
}
`;

// ---------------------------------------------------------------------------
// Magnetic wrapper — the GSAP "pull toward cursor" effect lives on a wrapper
// div, so the inner element keeps its own semantics (Link/button) and we
// avoid polymorphic ref gymnastics (strict TS, no casts).
// ---------------------------------------------------------------------------
function Magnetic({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Touch devices have no hover — skip the effect entirely.
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      gsap.to(element, {
        x: x * 0.4,
        y: y * 0.4,
        scale: 1.05,
        ease: "power2.out",
        duration: 0.4,
      });
    };

    const handleMouseLeave = () => {
      gsap.to(element, {
        x: 0,
        y: 0,
        scale: 1,
        ease: "elastic.out(1, 0.3)",
        duration: 1.2,
      });
    };

    element.addEventListener("mousemove", handleMouseMove);
    element.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      element.removeEventListener("mousemove", handleMouseMove);
      element.removeEventListener("mouseleave", handleMouseLeave);
      gsap.killTweensOf(element);
    };
  }, []);

  return (
    <div ref={ref} className={cn("inline-block", className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marquee content (duplicated twice in the strip for a seamless loop)
// ---------------------------------------------------------------------------
const MARQUEE = [
  "Escrow on every order",
  "Instant delivery",
  "Money-back guarantee",
  "AI Dispute Judge",
  "Lowest fees",
  "100% Buyer Protection",
];

function MarqueeItem() {
  return (
    <div className="cine-marquee-item">
      {MARQUEE.map((label, i) => (
        <span key={label} className="contents">
          <span>{label}</span>
          <span className={i % 2 ? "sx alt" : "sx"}>✦</span>
        </span>
      ))}
    </div>
  );
}

const colHeading =
  "mb-3 font-heading text-[11px] font-semibold tracking-[0.12em] text-faint uppercase";
const colLink =
  "block w-max max-w-full py-[5px] font-heading text-[13.5px] font-medium text-muted-foreground transition-[color,transform] duration-150 hover:translate-x-[3px] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none rounded-sm";

export function CinematicFooter() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <style>{STYLES}</style>

      <footer
        aria-label="Site footer"
        className="relative mt-auto overflow-hidden border-t border-border bg-background"
      >
        {/* ambient grid across the whole footer */}
        <div
          className="pointer-events-none absolute inset-0 mask-[linear-gradient(to_bottom,transparent,#000_30%,#000_70%,transparent)]"
          aria-hidden="true"
          style={{
            backgroundSize: "60px 60px",
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.035) 1px, transparent 1px)",
          }}
        />

        {/* straight marquee strip */}
        <div
          className="relative overflow-hidden border-b border-border bg-background/60 py-3.5 backdrop-blur-[8px]"
          aria-hidden="true"
        >
          <div className="cine-marquee-track">
            <MarqueeItem />
            <MarqueeItem />
          </div>
        </div>

        {/* CTA — aurora + giant wordmark live INSIDE this block, behind its text */}
        <div className="relative px-6 py-16 text-center min-[761px]:py-24">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="cine-aurora" />
          </div>

          <div className="relative">
            <span className="font-heading text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              {siteConfig.name} · {siteConfig.domain}
            </span>
            <h2 className="cine-heading mx-auto mt-4 text-[clamp(34px,6vw,64px)] font-extrabold tracking-[-0.03em]">
              Ready to level up?
            </h2>
            <p className="mx-auto mt-3.5 max-w-[48ch] text-[clamp(15px,1.8vw,18px)] text-muted-foreground">
              Buy and sell game accounts, items &amp; top-ups — safe, instant,
              and escrow-protected from start to finish.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <Magnetic className="w-full max-w-[340px] min-[761px]:w-auto min-[761px]:max-w-none">
                <Link href="/marketplace" className="glass-pill lg primary">
                  <SearchIcon aria-hidden="true" />
                  Browse marketplace
                </Link>
              </Magnetic>
              <Magnetic className="w-full max-w-[340px] min-[761px]:w-auto min-[761px]:max-w-none">
                <Link href="/become-seller" className="glass-pill lg">
                  <ShoppingBagIcon aria-hidden="true" />
                  Start selling — free
                </Link>
              </Magnetic>
            </div>
          </div>
        </div>

        {/* detailed link columns — glass card */}
        <div className="relative mx-auto w-full max-w-[1120px] px-[22px]">
          <div className="rounded-[18px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(18,20,24,.34),rgba(11,12,15,.6))] p-5 shadow-[0_34px_70px_-34px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-[16px] backdrop-saturate-[1.18] min-[761px]:rounded-[22px] min-[761px]:p-[30px]">
            <div className="grid grid-cols-2 gap-5 min-[561px]:grid-cols-3 min-[761px]:gap-[26px] min-[901px]:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr]">
              {/* brand column */}
              <div className="col-span-2 min-[561px]:col-span-3 min-[901px]:col-span-1">
                <Link
                  href="/"
                  aria-label="GETX home"
                  className="mb-3 block w-fit rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Logo className="h-[26px]" />
                </Link>
                <p className="mb-3.5 max-w-[34ch] font-sans text-[13px] leading-relaxed text-muted-foreground">
                  The fast, trust-first gaming marketplace. Buy &amp; sell game
                  accounts, items &amp; top-ups safely with escrow.
                </p>
                <div className="flex gap-2">
                  {socials.map((s) => {
                    const Icon = socialIcons[s.icon];
                    return (
                      <Magnetic key={s.label}>
                        <a
                          href={s.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={s.label}
                          className="glass grid size-9 place-items-center rounded-full text-muted-foreground transition-colors duration-300 hover:border-primary/45 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          <Icon className="size-[17px]" />
                        </a>
                      </Magnetic>
                    );
                  })}
                </div>
              </div>

              {footerNav.map((col) => (
                <nav key={col.heading} aria-label={col.heading}>
                  {/* h2 (not h5) keeps the document heading order sequential
                      after the page's h2 sections — classes drive the look. */}
                  <h2 className={colHeading}>{col.heading}</h2>
                  {col.items.map((item) => (
                    <Link key={item.href} href={item.href} className={colLink}>
                      {item.title}
                    </Link>
                  ))}
                </nav>
              ))}
            </div>

            {/* security assurance row — payment-method advertising removed (O-T10) */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-[18px]">
              <span className="inline-flex items-center gap-[7px] rounded-full border border-success/40 bg-success/15 px-3 py-1.5 font-heading text-[11.5px] font-semibold text-[#bfe6d4]">
                <LockIcon className="size-3.5 text-success" aria-hidden="true" />
                256-bit secure checkout
              </span>
            </div>
          </div>
        </div>

        {/* bottom bar */}
        <div className="relative mx-auto flex w-full max-w-[1120px] flex-col items-center gap-4 px-[22px] py-6 min-[761px]:flex-row min-[761px]:justify-between">
          <div className="glass order-1 inline-flex items-center gap-2 rounded-full px-5 py-[11px] min-[761px]:order-2">
            <span className="font-heading text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
              Crafted with
            </span>
            <span className="cine-heart" aria-hidden="true">
              ❤
            </span>
            <span className="font-heading text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
              in India by
            </span>
            <span className="font-heading text-[11px] font-extrabold text-foreground">
              {siteConfig.name}
            </span>
          </div>

          <p className="order-2 font-heading text-[11px] font-semibold tracking-[0.12em] text-faint uppercase min-[761px]:order-1">
            © 2026 {siteConfig.name} · {siteConfig.domain} — built for gamers.
          </p>

          <Magnetic className="order-3">
            <button
              type="button"
              onClick={scrollToTop}
              aria-label="Back to top"
              className="glass grid size-12 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-300 hover:border-primary/45 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&:hover>svg]:-translate-y-1"
            >
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="size-5 transition-transform duration-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
            </button>
          </Magnetic>
        </div>

        {/* giant GETX watermark — the footer's final sign-off */}
        <div className="cine-giant-wrap" aria-hidden="true">
          <div className="cine-giant">GETX</div>
        </div>
      </footer>
    </>
  );
}
