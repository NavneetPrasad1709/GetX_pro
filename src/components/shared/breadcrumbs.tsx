import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export type Crumb = {
  label: string;
  /** Omit on the last (current page) crumb. */
  href?: string;
};

/**
 * BreadcrumbList JSON-LD for rich results. Labels here are ADMIN-SEEDED
 * catalog data (game/category names), never user input — and `<` is escaped
 * anyway so the payload can't break out of the script tag.
 */
function breadcrumbJsonLd(items: Crumb[]): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `${siteConfig.url}${item.href}` } : {}),
    })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Visual breadcrumb trail + matching JSON-LD. Server component. */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <>
      <nav aria-label="Breadcrumb" className={className}>
        <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-faint">
          {items.map((item, i) => {
            const last = i === items.length - 1;
            return (
              <li
                key={`${item.label}-${i}`}
                className="flex items-center gap-1.5"
              >
                {item.href && !last ? (
                  <Link
                    href={item.href}
                    className="rounded-sm transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={cn(last && "text-muted-foreground")}
                  >
                    {item.label}
                  </span>
                )}
                {!last ? (
                  <ChevronRightIcon
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        // Safe: admin-seeded labels + escaped serialization (see above).
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(items) }}
      />
    </>
  );
}
