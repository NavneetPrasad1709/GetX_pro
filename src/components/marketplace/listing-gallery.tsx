"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  images: string[];
  title: string;
  /** Monogram fallback (game mono) shown when a listing has no images yet. */
  mono: string;
};

/**
 * Listing image gallery. Listings carry no images until R2 uploads land
 * (Step 12), so the common path today is the branded monogram fallback — same
 * visual language as the card cover. When images exist, the main image is the
 * LCP element (priority) and thumbnails switch it client-side.
 */
export function ListingGallery({ images, title, mono }: Props) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-secondary">
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_top_left,rgba(77,124,254,0.16),transparent_55%)]">
          <span className="font-heading text-5xl font-extrabold tracking-tight text-foreground/10 select-none">
            {mono}
          </span>
        </div>
      </div>
    );
  }

  const current = Math.min(active, images.length - 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-secondary">
        <Image
          src={images[current]}
          alt={`${title} — image ${current + 1} of ${images.length}`}
          fill
          sizes="(max-width: 900px) 100vw, 640px"
          className="object-cover"
          priority
        />
      </div>

      {images.length > 1 ? (
        <ul className="grid grid-cols-5 gap-2" aria-label="Listing images">
          {images.map((src, i) => (
            // index key: the array never reorders client-side, and image URLs
            // are an unconstrained String[] that could contain duplicates.
            <li key={i}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === current ? "step" : undefined}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-md border bg-secondary transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  i === current
                    ? "border-primary"
                    : "border-border hover:border-primary/40",
                )}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
