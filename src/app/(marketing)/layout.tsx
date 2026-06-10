import { auth } from "@/lib/auth";
import { countUnread } from "@/server/services/chat";
import { SiteHeader } from "@/components/layout/site-header";
import { CinematicFooter } from "@/components/layout/cinematic-footer";
import { MobileNav } from "@/components/layout/mobile-nav";

/**
 * Marketing shell (Prompt 01) — full chrome: SiteHeader (TrustRibbon + nav +
 * Sell CTA), CinematicFooter (GSAP marquee + aurora + link columns) and the
 * marketing MobileNav. This is the ONLY layout that renders CinematicFooter.
 * Reads the unread chat count so the bottom-nav Messages tab can badge it (07).
 */
export default async function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const unread = session?.user ? await countUnread(session.user.id) : 0;

  return (
    <>
      <SiteHeader />
      {/* pb-[74px]: content clears the fixed bottom nav on ≤900px */}
      <div className="flex flex-1 flex-col pb-[74px] min-[901px]:pb-0">
        {children}
      </div>
      <CinematicFooter />
      <MobileNav unreadMessages={unread} />
    </>
  );
}
