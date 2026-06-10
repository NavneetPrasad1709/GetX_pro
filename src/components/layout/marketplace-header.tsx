import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/shared/icons";
import { UserMenu } from "@/components/layout/user-menu";

/**
 * Shop shell header (Prompt 01): search-first marketplace bar.
 * Same sticky height as SiteHeader (h-58/66) so listing-page sticky offsets
 * stay correct, but no TrustRibbon and no "Sell" CTA — browsing-focused.
 * RSC: reads the live session for the auth state only.
 */
export async function MarketplaceHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-[rgba(10,11,13,0.88)] backdrop-blur-[12px]">
      <div className="mx-auto flex h-[58px] w-full max-w-[1120px] items-center gap-3.5 px-[22px] min-[901px]:h-[66px] min-[901px]:gap-5">
        <Link
          href="/"
          aria-label="GETX home"
          className="shrink-0 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logo priority className="h-6 min-[901px]:h-[27px]" />
        </Link>

        {/* search-first positioning (Eldorado/G2G/G2A standard) */}
        <form action="/marketplace" role="search" className="relative flex max-w-md flex-1 items-center">
          <SearchIcon
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            placeholder="Search listings…"
            aria-label="Search listings"
            className="h-10 w-full rounded-md border border-border bg-secondary pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
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
        </div>
      </div>
    </header>
  );
}
