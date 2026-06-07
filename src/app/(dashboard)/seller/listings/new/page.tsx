import type { Metadata } from "next";
import { getCatalogForForm } from "@/server/services/catalog";
import { ListingForm } from "@/components/seller/listing-form";

export const metadata: Metadata = { title: "New listing" };

/** Create listing — the catalog tree feeds the game/category selects. */
export default async function NewListingPage() {
  const catalog = await getCatalogForForm();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New listing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save as a draft anytime — publish when it&apos;s ready. Your first
          listing is free.
        </p>
      </div>
      <ListingForm catalog={catalog} />
    </div>
  );
}
