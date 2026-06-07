import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  pageCount: number;
  /** Path without query — page 1 links here (canonical-friendly, no `?page=1`). */
  basePath: string;
  /**
   * Other query params to KEEP on every page link (serialized, WITHOUT `page`),
   * e.g. the marketplace's active filters "game=pokemon-go&type=account". Each
   * link merges these with the right `page` so filters survive pagination.
   */
  searchParams?: string;
  className?: string;
};

function hrefFor(basePath: string, page: number, searchParams?: string): string {
  const params = new URLSearchParams(searchParams);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Compact page window: first, last and current±1, with "…" gaps.
 * e.g. page 5 of 9 → [1, "…", 4, 5, 6, "…", 9]
 */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const wanted = [1, page - 1, page, page + 1, pageCount]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const unique = [...new Set(wanted)];

  const out: (number | "gap")[] = [];
  for (let i = 0; i < unique.length; i++) {
    if (i > 0 && unique[i] - unique[i - 1] > 1) out.push("gap");
    out.push(unique[i]);
  }
  return out;
}

// 44px cells on phones (comfortable tap target, WCAG 2.5.5 / Apple HIG),
// compact 36px from the 521px breakpoint up where a pointer is precise.
const cellClass =
  "grid size-11 min-[521px]:size-9 place-items-center rounded-sm border border-border bg-card font-heading text-[13px] font-semibold transition-colors duration-150";

/**
 * Link-based pagination — pure server component, zero client JS, every page
 * is a crawlable <a>. Renders nothing when there is only one page.
 */
export function Pagination({
  page,
  pageCount,
  basePath,
  searchParams,
  className,
}: Props) {
  if (pageCount <= 1) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= pageCount;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1.5", className)}
    >
      {prevDisabled ? (
        <span aria-hidden="true" className={cn(cellClass, "opacity-40")}>
          <ChevronLeftIcon className="size-4" />
        </span>
      ) : (
        <Link
          href={hrefFor(basePath, page - 1, searchParams)}
          aria-label="Previous page"
          className={cn(
            cellClass,
            "text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
        </Link>
      )}

      {pageWindow(page, pageCount).map((item, i) =>
        item === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="px-1 text-faint"
          >
            …
          </span>
        ) : item === page ? (
          <span
            key={item}
            aria-current="page"
            className={cn(
              cellClass,
              "border-primary-strong bg-primary-strong text-primary-foreground",
            )}
          >
            {item}
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(basePath, item, searchParams)}
            aria-label={`Page ${item}`}
            className={cn(
              cellClass,
              "text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            )}
          >
            {item}
          </Link>
        ),
      )}

      {nextDisabled ? (
        <span aria-hidden="true" className={cn(cellClass, "opacity-40")}>
          <ChevronRightIcon className="size-4" />
        </span>
      ) : (
        <Link
          href={hrefFor(basePath, page + 1, searchParams)}
          aria-label="Next page"
          className={cn(
            cellClass,
            "text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
        >
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}
