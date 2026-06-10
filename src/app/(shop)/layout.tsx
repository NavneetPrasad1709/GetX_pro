import { MarketplaceHeader } from "@/components/layout/marketplace-header";
import { SlimFooter } from "@/components/layout/slim-footer";
import { SupportWidget } from "@/components/chat/support-widget";

/**
 * Shop shell (Prompt 01) — search-first MarketplaceHeader + slim legal footer.
 * No CinematicFooter, no MobileNav. Wraps /games, /marketplace, /listing/[slug]
 * and /sellers/[id]. The AI Support widget (Step 16) floats on every shop page.
 */
export default function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <MarketplaceHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <SlimFooter />
      <SupportWidget />
    </>
  );
}
