import { getTrendingSearches } from "@/server/services/demand-forecast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Trending search terms (Step 26) — the most-run marketplace searches in the last 7 days, from the
 * fire-and-forget SearchLog. A demand signal for which games/categories to recruit sellers into.
 */
export async function TrendingSearches() {
  const rows = await getTrendingSearches(7, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trending searches</CardTitle>
        <CardDescription>What buyers searched for in the last 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No searches logged yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <span
                key={r.query}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
              >
                <span className="font-medium">{r.query}</span>
                <span className="font-bold tabular-nums text-primary">{r.count}</span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
