"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  ShoppingBagIcon,
  MessageSquareIcon,
  SettingsIcon,
  StoreIcon,
  PackageIcon,
  PlusIcon,
  WalletIcon,
  ShieldCheckIcon,
  BarChart3Icon,
  GavelIcon,
  UserCheckIcon,
  BanknoteIcon,
  UsersIcon,
  ActivityIcon,
  RocketIcon,
  ShieldAlertIcon,
  GiftIcon,
  InboxIcon,
  LifeBuoyIcon,
  SparklesIcon,
  BookOpenIcon,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

type SidebarItem = { href: string; label: string; icon: LucideIcon; soon?: boolean };
type SidebarGroup = { heading?: string; items: SidebarItem[] };

/**
 * Role-aware app-shell sidebar (Prompt 06; fleshes out the Prompt-01 placeholder).
 * Buyer base links for everyone, plus a Seller Hub or Admin group by role. Pure
 * client island (usePathname for active state); all data is static.
 */
function groupsFor(role: Role): SidebarGroup[] {
  const base: SidebarItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
    { href: "/orders", label: "Orders", icon: ShoppingBagIcon },
    { href: "/messages", label: "Messages", icon: MessageSquareIcon },
    { href: "/loyalty", label: "Rewards", icon: SparklesIcon },
    { href: "/referrals", label: "Refer & earn", icon: GiftIcon },
  ];

  if (role === "ADMIN") {
    return [
      { items: base },
      {
        heading: "Admin",
        items: [
          { href: "/admin", label: "Control room", icon: LayoutDashboardIcon },
          { href: "/admin/analytics", label: "Analytics", icon: BarChart3Icon },
          { href: "/admin/ops", label: "Ops queue", icon: InboxIcon },
          { href: "/admin/support", label: "Support", icon: LifeBuoyIcon },
          { href: "/admin/guides", label: "Guides", icon: BookOpenIcon },
          { href: "/admin/fraud", label: "Fraud", icon: ShieldAlertIcon },
          { href: "/admin/liquidity", label: "Liquidity", icon: ActivityIcon },
          { href: "/admin/disputes", label: "Disputes", icon: GavelIcon },
          { href: "/admin/kyc", label: "KYC", icon: UserCheckIcon },
          { href: "/admin/payouts", label: "Payouts", icon: BanknoteIcon },
          { href: "/admin/orders", label: "Orders", icon: ShoppingBagIcon },
          { href: "/admin/listings", label: "Listings", icon: PackageIcon },
          { href: "/admin/users", label: "Users", icon: UsersIcon },
        ],
      },
    ];
  }

  if (role === "SELLER") {
    return [
      { items: base },
      {
        heading: "Seller hub",
        items: [
          { href: "/seller", label: "Overview", icon: StoreIcon },
          { href: "/seller/orders", label: "Orders", icon: ShoppingBagIcon },
          { href: "/seller/listings", label: "Listings", icon: PackageIcon },
          { href: "/seller/listings/new", label: "New listing", icon: PlusIcon },
          { href: "/seller/wallet", label: "Wallet", icon: WalletIcon },
          { href: "/seller/loyalty", label: "Sale rewards", icon: SparklesIcon },
          { href: "/seller/guides", label: "Guides", icon: BookOpenIcon },
          { href: "/seller/subscription", label: "GETX Pro", icon: RocketIcon },
          { href: "/seller/verify", label: "Verify", icon: ShieldCheckIcon },
          { href: "/seller/analytics", label: "Analytics", icon: BarChart3Icon },
        ],
      },
    ];
  }

  return [
    { items: [...base, { href: "/settings", label: "Settings", icon: SettingsIcon, soon: true }] },
  ];
}

function isActive(pathname: string, href: string): boolean {
  // Exact match for section roots so a deep child doesn't light up the parent.
  if (href === "/dashboard" || href === "/seller" || href === "/admin") {
    return pathname === href;
  }
  // "Listings" stays active on /edit but not on the sibling /new item.
  if (href === "/seller/listings") {
    return pathname.startsWith("/seller/listings") && pathname !== "/seller/listings/new";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const groups = groupsFor(role);

  return (
    <nav aria-label="App navigation" className="flex flex-col gap-4">
      {groups.map((group, gi) => (
        <div key={group.heading ?? `g${gi}`} className="flex flex-col gap-1">
          {group.heading ? (
            <p className="px-3 pt-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
              {group.heading}
            </p>
          ) : null}
          {group.items.map((item) =>
            item.soon ? (
              <span
                key={item.href}
                title="Coming soon"
                className="flex items-center gap-3 rounded-md px-3 py-2 font-heading text-sm font-medium text-faint/60"
              >
                <item.icon className="size-[18px]" aria-hidden="true" />
                {item.label}
                <span className="ml-auto text-[10px] font-normal">soon</span>
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 font-heading text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  isActive(pathname, item.href)
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <item.icon className="size-[18px]" aria-hidden="true" />
                {item.label}
              </Link>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
