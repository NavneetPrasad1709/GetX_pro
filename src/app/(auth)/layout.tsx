import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ShieldCheckIcon, BadgeCheckIcon, RefreshCwIcon } from "lucide-react";

/**
 * Premium auth shell — split layout: a dark brand/trust panel on desktop, a
 * focused form column everywhere. Mobile-first (panel collapses; logo moves
 * above the card). Auth pages carry zero search value → noindex.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

const TRUST = [
  {
    icon: ShieldCheckIcon,
    title: "Escrow on every order",
    desc: "Your payment is held safely until you confirm delivery.",
  },
  {
    icon: BadgeCheckIcon,
    title: "ID-verified sellers",
    desc: "Every seller passes identity verification before they can list.",
  },
  {
    icon: RefreshCwIcon,
    title: "Free money-back guarantee",
    desc: "Get exactly what you paid for — or a full refund, fees included.",
  },
];

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col lg:flex-row">
      {/* ── Brand + trust panel (desktop) ── */}
      <aside className="relative hidden overflow-hidden bg-bg-2 p-10 lg:flex lg:w-[44%] lg:max-w-[600px] lg:flex-col lg:justify-between xl:p-14">
        {/* ambient gradient + grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 85% 0%, rgba(79,140,255,0.22), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(25,195,125,0.16), transparent 60%)",
          }}
        />
        <div className="relative">
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/getx-logo.webp"
              alt="GETX"
              width={2089}
              height={753}
              priority
              className="h-8 w-auto"
            />
          </Link>
        </div>

        <div className="relative">
          <h2 className="font-heading text-3xl leading-tight font-extrabold tracking-tight text-foreground xl:text-4xl">
            The safe way to buy &amp; sell game accounts.
          </h2>
          <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
            Join thousands of gamers trading accounts, items, top-ups and
            boosting — protected by escrow on every order.
          </p>

          <ul className="mt-9 flex flex-col gap-5">
            {TRUST.map((t) => (
              <li key={t.title} className="flex items-start gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary">
                  <t.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-heading text-sm font-semibold text-foreground">
                    {t.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {t.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-faint">
          © {new Date().getFullYear()} GETX — built for gamers, secured by
          escrow.
        </p>
      </aside>

      {/* ── Form column ── */}
      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          {/* mobile logo (panel is hidden) */}
          <Link
            href="/"
            className="mb-7 flex justify-center lg:hidden"
            aria-label="GETX home"
          >
            <Image
              src="/getx-logo.webp"
              alt="GETX"
              width={2089}
              height={753}
              priority
              className="h-8 w-auto"
            />
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}
