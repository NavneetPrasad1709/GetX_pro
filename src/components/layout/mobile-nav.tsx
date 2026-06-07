"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  SearchIcon,
  PlusIcon,
  FileTextIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import { mobileNav, type MobileNavItem } from "@/config/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<MobileNavItem["icon"], LucideIcon> = {
  home: HomeIcon,
  search: SearchIcon,
  sell: PlusIcon,
  orders: FileTextIcon,
  account: UserIcon,
};

/** Fixed bottom app nav (v10 ".mobilenav") — phones + tablets (≤900px). */
export function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[55] border-t border-border bg-[rgba(10,11,13,0.96)] backdrop-blur-[10px] min-[901px]:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-center justify-around px-1.5 pt-2 pb-3">
        {mobileNav.map((item) => {
          const Icon = ICONS[item.icon];

          if (item.icon === "sell") {
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex flex-col items-center gap-[3px] rounded-lg font-heading text-[10px] font-medium text-faint focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="-mt-[18px] grid size-11 place-items-center rounded-full bg-primary-strong text-primary-foreground">
                    <Icon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  {item.title}
                </Link>
              </li>
            );
          }

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
                <Icon className="size-[22px]" aria-hidden="true" />
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
