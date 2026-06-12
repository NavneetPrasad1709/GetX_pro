"use client";

import {
  SORT_OPTIONS,
  TRUST_TIERS,
  RATING_TIERS,
  MIN_SALES_OPTIONS,
  TYPE_PARAM_TO_KIND,
  type MarketplaceFilters,
} from "@/lib/validators/marketplace";
import { LISTING_TYPE_LABEL } from "@/config/games";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export type GameOption = { slug: string; name: string };

export type FilterControlsProps = {
  filters: MarketplaceFilters;
  games: GameOption[];
  facets: { byGame: { slug: string; count: number }[]; byType: { type: string; count: number }[] };
  pushParams: (overrides: Record<string, string | undefined>) => void;
  /** debounced price inputs live in the parent; passed in so both surfaces share state */
  minPrice: string;
  maxPrice: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  /** unique id prefix per surface (desktop vs sheet) to avoid duplicate DOM ids */
  idPrefix: string;
  /** render the Sort select (mobile sheet only — desktop has it in the top row) */
  includeSort?: boolean;
};

/**
 * The marketplace filter control groups (Prompt 07b). Rendered in BOTH the
 * desktop inline grid and the mobile bottom sheet — wrappers/layout live with
 * each caller; this returns just the labelled groups so IDs stay unique via
 * `idPrefix`. Every change writes to the URL via `pushParams`.
 */
export function FilterControls({
  filters,
  games,
  facets,
  pushParams,
  minPrice,
  maxPrice,
  onMinChange,
  onMaxChange,
  idPrefix,
  includeSort = false,
}: FilterControlsProps) {
  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <>
      {includeSort ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("sort")}>Sort by</Label>
          <NativeSelect
            id={id("sort")}
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
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("game")}>Game</Label>
        <NativeSelect
          id={id("game")}
          value={filters.game ?? ""}
          onChange={(e) => pushParams({ game: e.target.value || undefined })}
        >
          <option value="">All games</option>
          {games.map((g) => {
            const cnt = facets.byGame.find((x) => x.slug === g.slug)?.count;
            return (
              <option key={g.slug} value={g.slug}>
                {g.name}
                {cnt !== undefined ? ` (${cnt})` : ""}
              </option>
            );
          })}
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("type")}>Type</Label>
        <NativeSelect
          id={id("type")}
          value={filters.type ? filters.type.toLowerCase() : ""}
          onChange={(e) => pushParams({ type: e.target.value || undefined })}
        >
          <option value="">All types</option>
          {(["account", "item", "currency", "boosting"] as const).map((t) => {
            const kind = TYPE_PARAM_TO_KIND[t];
            const cnt = facets.byType.find((x) => x.type === kind)?.count;
            return (
              <option key={t} value={t}>
                {LISTING_TYPE_LABEL[kind]}
                {cnt !== undefined ? ` (${cnt})` : ""}
              </option>
            );
          })}
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("delivery")}>Delivery</Label>
        <NativeSelect
          id={id("delivery")}
          value={filters.delivery ? filters.delivery.toLowerCase() : ""}
          onChange={(e) => pushParams({ delivery: e.target.value || undefined })}
        >
          <option value="">Any speed</option>
          <option value="instant">Instant</option>
          <option value="manual">Manual</option>
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("trust")}>Seller trust</Label>
        <NativeSelect
          id={id("trust")}
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
        <Label htmlFor={id("rating")}>Seller rating</Label>
        <NativeSelect
          id={id("rating")}
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
        <Label htmlFor={id("min-sales")}>Seller experience</Label>
        <NativeSelect
          id={id("min-sales")}
          value={filters.minSales !== undefined ? String(filters.minSales) : ""}
          onChange={(e) => pushParams({ minSales: e.target.value || undefined })}
        >
          <option value="">Any experience</option>
          {MIN_SALES_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("verified")}>Seller status</Label>
        <NativeSelect
          id={id("verified")}
          value={filters.verified ? "1" : ""}
          onChange={(e) => pushParams({ verified: e.target.value || undefined })}
        >
          <option value="">Any seller</option>
          <option value="1">Verified only</option>
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("min")}>Min price ($)</Label>
        <Input
          id={id("min")}
          inputMode="decimal"
          placeholder="0"
          value={minPrice}
          onChange={(e) => onMinChange(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("max")}>Max price ($)</Label>
        <Input
          id={id("max")}
          inputMode="decimal"
          placeholder="Any"
          value={maxPrice}
          onChange={(e) => onMaxChange(e.target.value)}
        />
      </div>
    </>
  );
}
