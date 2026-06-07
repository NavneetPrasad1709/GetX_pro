"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainNav } from "@/config/nav";
import { cn } from "@/lib/utils";

/**
 * Desktop header nav with active state (v10 ".nav") — tiny client island so
 * the rest of the header stays a server component.
 */
export function NavLinks() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Main"
      className="hidden items-center gap-1.5 min-[901px]:flex"
    >
      {mainNav.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-sm px-[13px] py-[9px] font-heading text-[14.5px] font-medium transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
