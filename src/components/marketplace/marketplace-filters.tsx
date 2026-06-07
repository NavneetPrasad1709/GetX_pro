"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon, SlidersHorizontalIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { minorToMajorString } from "@/lib/money";
import {
  SORT_OPTIONS,
  TRUST_TIERS,
  RATING_TIERS,
  hasActiveFilters,
  type MarketplaceFilters,
} from "@/lib/validators/marketplace";
import { LISTING_TYPE_LABEL } from "@/config/games";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

type GameOption = { slug: string; name: string };

type Props = {
  filters: MarketplaceFilters;
  games: GameOption[];
};

const SEARCH_DEBOUNCE_MS = 350;

/** Count of active filters (excludes search + sort) — drives the mobile badge. */
function activeFilterCount(f: MarketplaceFilters): number {
  let n = 0;
  if (f.game) n++;
  if (f.type) n++;
  if (f.delivery) n++;
  if (f.minPriceMinor !== undefined || f.maxPriceMinor !== undefined) n++;
  if (f.trust !== undefined) n++;
  if (f.rating !== undefined) n++;
  if (f.currency) n++;
  return n;
}

/**
 * Interactive marketplace filter bar (the ONLY client island on the page).
 * Every control writes to the URL query so results stay shareable + SEO-ok;
 * the server re-renders the grid from those params. Search is debounced;
 * selects + price apply on change. Native <select> = zero extra JS + OS picker
 * on mobile. The actual listing grid is rendered server-side (see results).
 */
export function MarketplaceFilters({ filters, games }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL-derived display values for the free-text inputs.
  const urlQ = filters.q ?? "";
  const urlMin =
    filters.minPriceMinor !== undefined
      ? minorToMajorString(filters.minPriceMinor, "INR")
      : "";
  const urlMax =
    filters.maxPriceMinor !== undefined
      ? minorToMajorString(filters.maxPriceMinor, "INR")
      : "";

  // Local state only for the debounced text inputs; selects read the URL.
  const [q, setQ] = useState(urlQ);
  const [minPrice, setMinPrice] = useState(urlMin);
  const [maxPrice, setMaxPrice] = useState(urlMax);
  const [panelOpen, setPanelOpen] = useState(false);

  // Adopt URL-derived values when they change from OUTSIDE this bar (a removed
  // chip, "clear all", "reset all"). setState DURING RENDER is React's
  // recommended way to reset state on a prop change — no effect, no extra paint.
  // Our own pushes converge to the same values, so this is a no-op for them
  // (and never clobbers an in-progress edit, since pushParams sends all three).
  const [urlSnapshot, setUrlSnapshot] = useState({
    q: urlQ,
    min: urlMin,
    max: urlMax,
  });
  if (
    urlSnapshot.q !== urlQ ||
    urlSnapshot.min !== urlMin ||
    urlSnapshot.max !== urlMax
  ) {
    setUrlSnapshot({ q: urlQ, min: urlMin, max: urlMax });
    setQ(urlQ);
    setMinPrice(urlMin);
    setMaxPrice(urlMax);
  }

  // Always read the LATEST URL params, even from a stale debounce-timer
  // closure: otherwise a select change made within the debounce window could be
  // overwritten by a timer that captured the pre-change params. (Synced in an
  // effect — writing a ref during render is disallowed.)
  const spRef = useRef(searchParams);
  useEffect(() => {
    spRef.current = searchParams;
  }, [searchParams]);

  // Build the next URL: selects come from the live URL, free-text from local
  // state (so a select change never drops an in-progress search), then any
  // explicit override is applied. Every change resets to page 1.
  function pushParams(overrides: Record<string, string | undefined>) {
    const currentQs = spRef.current.toString();
    const params = new URLSearchParams(currentQs);
    const setOrDelete = (key: string, value: string | undefined) => {
      const v = value?.trim();
      if (v) params.set(key, v);
      else params.delete(key);
    };

    setOrDelete("q", q);
    setOrDelete("min", minPrice);
    setOrDelete("max", maxPrice);
    for (const [key, value] of Object.entries(overrides)) {
      setOrDelete(key, value);
    }
    params.delete("page");

    const qs = params.toString();
    if (qs === currentQs) return; // nothing actually changed
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  // Debounce free-text (search + price). Skip the very first run so we don't
  // re-navigate to the URL the page already loaded with.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const t = setTimeout(() => pushParams({}), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // pushParams reads live state; we only want to fire on text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, minPrice, maxPrice]);

  const count = activeFilterCount(filters);
  const showReset = hasActiveFilters(filters) || filters.sort !== "newest";

  return (
    <div className="flex flex-col gap-3" aria-busy={isPending || undefined}>
      {/* search + sort + (mobile) filter toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search listings…"
            aria-label="Search listings"
            className="h-10 pl-9"
          />
        </div>

        <div className="hidden items-center gap-2 min-[761px]:flex">
          <Label htmlFor="mp-sort" className="sr-only">
            Sort by
          </Label>
          <NativeSelect
            id="mp-sort"
            value={filters.sort}
            onChange={(e) => pushParams({ sort: e.target.value })}
            className="h-10 w-44"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          aria-controls="mp-filter-panel"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3 font-heading text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none min-[761px]:hidden"
        >
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
          )}
          Filters
          {count > 0 ? (
            <span className="grid size-5 place-items-center rounded-full bg-primary-strong text-[11px] font-bold text-primary-foreground">
              {count}
            </span>
          ) : null}
        </button>
      </div>

      {/* filter panel — always shown on desktop; toggled on mobile */}
      <div
        id="mp-filter-panel"
        className={cn(
          "grid-cols-2 gap-3 rounded-lg border border-border bg-card/40 p-3 min-[761px]:grid min-[761px]:grid-cols-4 min-[761px]:items-end min-[1024px]:grid-cols-6",
          panelOpen ? "grid" : "hidden",
        )}
      >
        {/* sort (mobile only — desktop has it in the top row) */}
        <div className="flex flex-col gap-1.5 min-[761px]:hidden">
          <Label htmlFor="mp-sort-m">Sort by</Label>
          <NativeSelect
            id="mp-sort-m"
            value={filters.sort}
            onChange={(e) => pushParams({ sort: e.target.value })}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mp-game">Game</Label>
          <NativeSelect
            id="mp-game"
            value={filters.game ?? ""}
            onChange={(e) => pushParams({ game: e.target.value || undefined })}
          >
            <option value="">All games</option>
            {games.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mp-type">Type</Label>
          <NativeSelect
            id="mp-type"
            value={filters.type ? filters.type.toLowerCase() : ""}
            onChange={(e) => pushParams({ type: e.target.value || undefined })}
          >
            <option value="">All types</option>
            <option value="account">{LISTING_TYPE_LABEL.ACCOUNT}</option>
            <option value="item">{LISTING_TYPE_LABEL.ITEM}</option>
            <option value="currency">{LISTING_TYPE_LABEL.CURRENCY}</option>
            <option value="boosting">{LISTING_TYPE_LABEL.BOOSTING}</option>
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mp-delivery">Delivery</Label>
          <NativeSelect
            id="mp-delivery"
            value={filters.delivery ? filters.delivery.toLowerCase() : ""}
            onChange={(e) =>
              pushParams({ delivery: e.target.value || undefined })
            }
          >
            <option value="">Any speed</option>
            <option value="instant">Instant</option>
            <option value="manual">Manual</option>
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mp-trust">Seller trust</Label>
          <NativeSelect
            id="mp-trust"
            value={filters.trust !== undefined ? String(filters.trust) : ""}
            onChange={(e) => pushParams({ trust: e.target.value || undefined })}
          >
            <option value="">Any trust</option>
            {TRUST_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}+ trust score
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mp-rating">Seller rating</Label>
          <NativeSelect
            id="mp-rating"
            value={filters.rating !== undefined ? String(filters.rating) : ""}
            onChange={(e) => pushParams({ rating: e.target.value || undefined })}
          >
            <option value="">Any rating</option>
            {RATING_TIERS.map((r) => (
              <option key={r} value={r}>
                {r}★ &amp; up
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mp-min">Min price (₹)</Label>
          <Input
            id="mp-min"
            inputMode="decimal"
            placeholder="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mp-max">Max price (₹)</Label>
          <Input
            id="mp-max"
            inputMode="decimal"
            placeholder="Any"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>

        {showReset ? (
          <div className="col-span-2 flex items-end min-[761px]:col-span-1">
            <a
              href="/marketplace"
              className="inline-flex h-8 items-center rounded-sm px-2 text-sm font-semibold text-primary transition-colors hover:text-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Reset all
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
