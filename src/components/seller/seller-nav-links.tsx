"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/seller", label: "Overview" },
  { href: "/seller/listings", label: "Listings" },
];

/** Seller sub-nav with active state (tiny client island). */
export function SellerNavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Seller" className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/seller"
            ? pathname === "/seller"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-sm px-3 py-1.5 font-heading text-sm font-semibold transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
