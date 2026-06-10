"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  SearchIcon,
  FileTextIcon,
  UserIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  StoreIcon,
  ShieldIcon,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { mobileNav, appNav } from "@/config/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  // marketing
  home: HomeIcon,
  search: SearchIcon,
  orders: FileTextIcon,
  account: UserIcon,
  // app + messages
  dashboard: LayoutDashboardIcon,
  messages: MessageSquareIcon,
  store: StoreIcon,
  shield: ShieldIcon,
};

type Variant = "marketing" | "app";
type NavTab = { title: string; href: string; icon: string };

/**
 * Fixed bottom app nav (v10 ".mobilenav") — phones + tablets (≤900px).
 * `variant="marketing"` (default) shows Home/Browse/Messages/Orders/Account;
 * `variant="app"` shows role-aware app tabs from `appNav`. No Sell FAB (Prompt 07).
 */
export function MobileNav({
  variant = "marketing",
  role,
  ordersBadge = 0,
  unreadMessages = 0,
}: {
  variant?: Variant;
  role?: Role;
  /** Action-required count shown on the Orders tab. */
  ordersBadge?: number;
  /** Unread chat count shown on the Messages tab. */
  unreadMessages?: number;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const items: NavTab[] =
    variant === "app"
      ? appNav.filter((item) => !item.roles || (role ? item.roles.includes(role) : false))
      : mobileNav;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[55] border-t border-border bg-[rgba(10,11,13,0.96)] backdrop-blur-[10px] min-[901px]:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-center justify-around px-1.5 pt-2 pb-3">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-[3px] rounded-lg px-2 font-heading text-[10px] font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "text-primary" : "text-faint hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" aria-hidden="true" />
                  {item.icon === "orders" && ordersBadge > 0 ? (
                    <span className="absolute -top-1 -right-1.5 grid min-w-4 place-items-center rounded-full bg-primary-strong px-1 text-[10px] font-bold text-primary-foreground">
                      {ordersBadge > 9 ? "9+" : ordersBadge}
                    </span>
                  ) : null}
                  {item.icon === "messages" && unreadMessages > 0 ? (
                    <span
                      aria-label={`${unreadMessages} unread messages`}
                      className="absolute -top-1 -right-1.5 grid min-w-4 place-items-center rounded-full bg-primary-strong px-1 text-[10px] font-bold text-primary-foreground"
                    >
                      {unreadMessages > 9 ? "9+" : unreadMessages}
                    </span>
                  ) : null}
                </span>
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
