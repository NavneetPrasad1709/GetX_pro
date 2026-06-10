"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { MarketplaceFilters } from "@/lib/validators/marketplace";
import type { FacetCounts } from "@/server/services/marketplace";
import {
  FilterControls,
  type GameOption,
} from "@/components/marketplace/filter-controls";

/**
 * Mobile marketplace filter bottom sheet (Prompt 07b). A Base UI Dialog that
 * slides up from the bottom (≤80dvh) so the listing grid stays visible behind
 * it. Filter changes write to the URL immediately (via `pushParams`); the
 * sticky "Apply" footer just closes the sheet. Lazy-loaded by MarketplaceFilters
 * so it never weighs on the marketplace LCP.
 */

export type FilterSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: MarketplaceFilters;
  games: GameOption[];
  facets: FacetCounts;
  pushParams: (overrides: Record<string, string | undefined>) => void;
  activeCount: number;
  minPrice: string;
  maxPrice: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
};

export function FilterSheet({
  open,
  onOpenChange,
  filters,
  games,
  facets,
  pushParams,
  activeCount,
  minPrice,
  maxPrice,
  onMinChange,
  onMaxChange,
}: FilterSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 duration-300 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-2xl bg-card ring-1 ring-border outline-none duration-300 data-closed:animate-out data-closed:slide-out-to-bottom data-open:animate-in data-open:slide-in-from-bottom">
          <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
            {/* drag handle + title */}
            <div className="shrink-0 px-4 pt-3">
              <span
                className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border"
                aria-hidden="true"
              />
              <Dialog.Title className="font-heading text-base font-bold">
                Filters
              </Dialog.Title>
            </div>

            {/* scrollable controls (single column) */}
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <FilterControls
                filters={filters}
                games={games}
                facets={facets}
                pushParams={pushParams}
                minPrice={minPrice}
                maxPrice={maxPrice}
                onMinChange={onMinChange}
                onMaxChange={onMaxChange}
                idPrefix="mp-sheet"
                includeSort
              />
            </div>

            {/* sticky footer */}
            <div className="sticky bottom-0 flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-4 pt-3 pb-4">
              <a
                href="/marketplace"
                className="text-sm font-semibold text-primary transition-colors hover:text-primary-hover focus-visible:outline-none"
              >
                Reset
              </a>
              <Dialog.Close className="rounded-sm bg-primary-strong px-6 py-3 font-heading text-sm font-bold text-primary-foreground transition-colors hover:bg-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                {activeCount > 0 ? `Apply (${activeCount})` : "Apply"}
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
