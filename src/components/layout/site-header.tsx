import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { CtaLink } from "@/components/shared/cta-link";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { NavLinks } from "@/components/layout/nav-links";
import { TrustRibbon } from "@/components/layout/trust-ribbon";
import { Logo } from "@/components/shared/icons";

/**
 * Global header (v10): trust ribbon (desktop) + sticky bar with logo, nav,
 * auth state and the Sell CTA. Server component — reads the live session.
 */
export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <>
      <TrustRibbon />

      <header className="sticky top-0 z-50 border-b border-border bg-[rgba(10,11,13,0.88)] backdrop-blur-[12px]">
        <div className="mx-auto flex h-[58px] w-full max-w-[1120px] items-center gap-3.5 px-[22px] min-[901px]:h-[66px] min-[901px]:gap-[26px]">
          {/* left: mobile menu + logo + desktop nav */}
          <MobileDrawer authed={!!user} />
          <Link
            href="/"
            aria-label="GETX home"
            className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Logo priority className="h-6 min-[901px]:h-[27px]" />
          </Link>
          <NavLinks />

          {/* right: auth state + Sell CTA */}
          <div className="ml-auto flex items-center gap-2.5">
            {user ? (
              <UserMenu
                user={{
                  name: user.name ?? null,
                  email: user.email ?? null,
                  image: user.image ?? null,
                  role: user.role,
                }}
              />
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-sm px-[18px] py-[11px] font-heading text-[14.5px] font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Log in
              </Link>
            )}

            <CtaLink href="/become-seller" className="whitespace-nowrap">
              <ShoppingBagIcon className="size-[17px]" aria-hidden="true" />
              Sell
            </CtaLink>
          </div>
        </div>
      </header>
    </>
  );
}
