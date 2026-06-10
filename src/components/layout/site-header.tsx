import Link from "next/link";
import { MessageSquareIcon, ShoppingBagIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { countUnread } from "@/server/services/chat";
import {
  countUnreadNotifications,
  getNotifications,
  type NotificationRow,
} from "@/server/services/notifications";
import { CtaLink } from "@/components/shared/cta-link";
import { NotificationBell } from "@/components/shared/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { NavLinks } from "@/components/layout/nav-links";
import { HeaderSearch } from "@/components/layout/header-search";
import { TrustRibbon } from "@/components/layout/trust-ribbon";
import { Logo } from "@/components/shared/icons";

/**
 * Global header (v10): trust ribbon (desktop) + sticky bar with logo, nav,
 * auth state and the Sell CTA. Server component — reads the live session.
 */
export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;
  let unread = 0;
  let notifUnread = 0;
  let notifItems: NotificationRow[] = [];
  if (user) {
    [unread, notifUnread, notifItems] = await Promise.all([
      countUnread(user.id),
      countUnreadNotifications(user.id),
      getNotifications(user.id),
    ]);
  }

  return (
    <>
      <TrustRibbon />

      <header className="sticky top-0 z-50 border-b border-border bg-[rgba(10,11,13,0.88)] backdrop-blur-[12px]">
        <div className="mx-auto flex h-[58px] w-full max-w-[1120px] items-center gap-3.5 px-[22px] min-[901px]:h-[66px] min-[901px]:gap-[26px]">
          {/* left: mobile menu + logo + desktop nav */}
          <MobileDrawer authed={!!user} role={user?.role ?? null} />
          <Link
            href="/"
            aria-label="GETX home"
            className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Logo priority className="h-6 min-[901px]:h-[27px]" />
          </Link>
          <NavLinks />

          {/* persistent search (desktop only — the drawer carries it on mobile) */}
          <div className="hidden max-w-[380px] flex-1 min-[901px]:flex">
            <HeaderSearch className="w-full" />
          </div>

          {/* right: auth state + Sell CTA */}
          <div className="ml-auto flex items-center gap-2.5">
            {user ? (
              <Link
                href="/messages"
                aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
                className="relative rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <MessageSquareIcon className="size-5" aria-hidden="true" />
                {unread > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary-strong px-1 text-[10px] font-bold text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
            ) : null}
            {user ? (
              <NotificationBell
                initialUnread={notifUnread}
                initialNotifications={notifItems}
              />
            ) : null}
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
