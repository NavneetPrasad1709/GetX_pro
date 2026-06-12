import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listAdminListings } from "@/server/services/admin";
import { formatMoney } from "@/lib/money";
import { AdminSearch } from "@/components/admin/admin-search";
import { ListingRemoveButton } from "@/components/admin/listing-remove-button";

export const metadata: Metadata = { title: "Listings — Admin" };

type Props = { searchParams: Promise<{ q?: string }> };

export default async function AdminListingsPage({ searchParams }: Props) {
  await requireRole("ADMIN");
  const { q } = await searchParams;
  const listings = await listAdminListings(q);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Listings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search and take down abusive listings (soft-removed, order history kept).
        </p>
      </div>

      <AdminSearch placeholder="Search by title or slug…" />

      {listings.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No listings found.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {listings.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 min-[761px]:flex-row min-[761px]:items-center min-[761px]:justify-between"
            >
              <div className="min-w-0">
                <Link
                  href={`/listing/${l.slug}`}
                  className="line-clamp-1 text-sm font-semibold hover:text-primary"
                >
                  {l.title}
                </Link>
                <p className="mt-0.5 text-xs text-faint">
                  {l.sellerName} · {formatMoney(l.priceMinor, l.currency)} ·{" "}
                  <span className="uppercase">{l.status}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ListingRemoveButton listingId={l.id} removed={l.status === "REMOVED"} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
