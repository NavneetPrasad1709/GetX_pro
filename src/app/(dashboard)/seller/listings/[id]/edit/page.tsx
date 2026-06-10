import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnedListing } from "@/server/services/listings";
import { getCatalogForForm } from "@/server/services/catalog";
import { getSellerDeliveryStock } from "@/server/services/delivery";
import { isEncryptionAvailable } from "@/lib/encryption";
import { minorToMajorString } from "@/lib/money";
import { ListingStatusBadge } from "@/components/seller/listing-status-badge";
import { DeliveryStockManager } from "@/components/seller/delivery-stock-manager";
import {
  ListingForm,
  type ListingFormInitial,
} from "@/components/seller/listing-form";

export const metadata: Metadata = { title: "Edit listing" };

type Props = { params: Promise<{ id: string }> };

/**
 * Edit listing. getOwnedListing returns null for both "doesn't exist" and
 * "not yours" — non-owners get a 404, never a confirmation the id exists.
 */
export default async function EditListingPage({ params }: Props) {
  const { id } = await params;
  const session = await requireUser();

  const [listing, catalog] = await Promise.all([
    getOwnedListing({ id: session.user.id, role: session.user.role }, id),
    getCatalogForForm(),
  ]);
  if (!listing) notFound();

  if (listing.status === "SOLD" || listing.status === "REMOVED") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Edit listing</h1>
        <p className="text-sm text-muted-foreground">
          <ListingStatusBadge status={listing.status} className="mr-2" />
          This listing is {listing.status.toLowerCase()} and can no longer be
          edited.
        </p>
      </div>
    );
  }

  // DB row → raw form values (price minor → major string; attrs → strings).
  const attributes: Record<string, string> = {};
  if (listing.attributes && typeof listing.attributes === "object") {
    for (const [key, value] of Object.entries(
      listing.attributes as Record<string, unknown>,
    )) {
      if (typeof value === "string" || typeof value === "number") {
        attributes[key] = String(value);
      }
    }
  }

  const initial: ListingFormInitial = {
    listingId: listing.id,
    status: listing.status,
    values: {
      gameId: listing.gameId,
      categoryId: listing.categoryId,
      type: listing.type,
      title: listing.title,
      description: listing.description,
      price: minorToMajorString(listing.priceMinor, listing.currency),
      stock: listing.stock,
      deliveryType: listing.deliveryType,
      attributes,
      images: listing.images ?? [],
      publish: false,
    },
  };

  // Auto-delivery stock (Step 19) — only for INSTANT listings. Fail-closed: if no encryption key,
  // hide the manager and show a neutral banner instead of crashing.
  const instant = listing.deliveryType === "INSTANT";
  const encryptionOn = isEncryptionAvailable();
  const stock = instant && encryptionOn
    ? await getSellerDeliveryStock(listing.id, session.user.id)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight">Edit listing</h1>
          <ListingStatusBadge status={listing.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          The listing URL stays the same — buyers&apos; bookmarks keep working.
        </p>
      </div>
      <ListingForm catalog={catalog} initial={initial} />

      {stock ? (
        <DeliveryStockManager
          listingId={listing.id}
          initialCount={stock.count}
          initialItems={stock.items}
        />
      ) : instant && !encryptionOn ? (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Auto-delivery is unavailable right now — contact support to enable instant delivery.
        </p>
      ) : null}
    </div>
  );
}
