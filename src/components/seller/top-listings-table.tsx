"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { SparklesIcon, Loader2Icon } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { getAIPricingSuggestion } from "@/server/actions/seller-analytics";
import type { TopListing } from "@/server/services/seller-analytics";

/** Top listings table with an on-demand AI pricing suggestion per row (Step 20). */
export function TopListingsTable({
  listings,
  currency,
}: {
  listings: TopListing[];
  currency: string;
}) {
  if (listings.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No completed sales in this period yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Listing</th>
            <th className="pb-2 text-right font-medium">Sales</th>
            <th className="pb-2 text-right font-medium">Revenue</th>
            <th className="pb-2 text-right font-medium">AI price</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <TopListingRow key={l.listingId} listing={l} currency={currency} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopListingRow({ listing, currency }: { listing: TopListing; currency: string }) {
  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await getAIPricingSuggestion(listing.listingId);
      if (!res.ok) {
        setError(res.error);
        setSuggestion(null);
        return;
      }
      setSuggestion(res.suggestion);
    });
  }

  return (
    <>
      <tr className="border-t border-border">
        <td className="max-w-[240px] truncate py-2.5">
          <Link
            href={`/listing/${listing.slug}`}
            className="font-medium hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {listing.title}
          </Link>
        </td>
        <td className="py-2.5 text-right tabular-nums">{listing.completedCount}</td>
        <td className="py-2.5 text-right font-semibold tabular-nums">
          {formatMoney(listing.revenue, currency)}
        </td>
        <td className="py-2.5 text-right">
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {pending ? (
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <SparklesIcon className="size-3.5" aria-hidden="true" />
            )}
            {pending ? "Thinking…" : "Suggest"}
          </button>
        </td>
      </tr>
      {suggestion || error ? (
        <tr>
          <td colSpan={4} className="pb-3">
            <div
              className={
                error
                  ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  : "rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs whitespace-pre-wrap text-foreground"
              }
            >
              {error ?? suggestion}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
