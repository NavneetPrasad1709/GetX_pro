"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { liteClient, type LiteClient } from "algoliasearch/lite";
import { formatMoney } from "@/lib/money";

const INDEX = "getx_listings";

type Hit = { objectID: string; title?: string; gameName?: string; priceMinor?: number; currency?: string; slug?: string };

/**
 * Instant search (Step 28). Live, typo-tolerant suggestions straight from Algolia (public search-only
 * key — NEVER the admin key). Renders NOTHING when Algolia isn't configured, so the marketplace's
 * existing server-side search input stays the search UX — zero JS error, graceful degradation.
 */
export function InstantSearchBar() {
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const searchKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;

  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const clientRef = useRef<LiteClient | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (appId && searchKey) clientRef.current = liteClient(appId, searchKey);
  }, [appId, searchKey]);

  if (!appId || !searchKey) return null; // not configured → existing search input remains

  function onChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      setHits([]);
      setOpen(false);
      return;
    }
    // 350ms debounce — a burst of keystrokes fires a single Algolia call.
    timer.current = setTimeout(async () => {
      const client = clientRef.current;
      if (!client) return;
      try {
        const { results } = await client.search<Hit>({
          requests: [{ indexName: INDEX, query: value, filters: "status:ACTIVE", hitsPerPage: 5 }],
        });
        const first = results[0];
        setHits("hits" in first ? (first.hits as Hit[]) : []);
        setOpen(true);
      } catch {
        setHits([]);
        setOpen(false);
      }
    }, 350);
  }

  function go() {
    setOpen(false);
    router.push(`/marketplace?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <SearchIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          onFocus={() => hits.length > 0 && setOpen(true)}
          placeholder="Search listings…"
          aria-label="Instant search"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
      {open && hits.length > 0 ? (
        <ul className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          {hits.map((h) => (
            <li key={h.objectID}>
              <button
                type="button"
                onMouseDown={() => router.push(`/listing/${h.slug ?? h.objectID}`)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate">{h.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{h.gameName}</span>
                {h.priceMinor != null ? (
                  <span className="shrink-0 font-semibold tabular-nums">{formatMoney(h.priceMinor, h.currency ?? "USD")}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
