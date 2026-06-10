"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  images: string[];
  title: string;
  /** Monogram fallback (game mono) shown when a listing has no images yet. */
  mono: string;
  /** Optional game cover art, blurred behind the monogram fallback (static). */
  gameImage: string | null;
};

/**
 * Listing image gallery. Listings carry no images until R2 uploads land
 * (Step 12), so the common path today is the branded monogram fallback — same
 * visual language as the card cover. When images exist, the main image is the
 * LCP element (priority) and thumbnails switch it client-side.
 */
/**
 * Branded "no photo yet" cover — shown when a listing has no images or one
 * breaks. Uses the game's cover art (blurred + dimmed) behind the monogram when
 * available, so it reads as intentional branding, not a broken/loading image.
 */
function MonoCover({ mono, gameImage }: { mono: string; gameImage: string | null }) {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[radial-gradient(ellipse_at_top_left,rgba(77,124,254,0.16),transparent_55%)]">
      {gameImage ? (
        <Image
          src={gameImage}
          alt=""
          fill
          sizes="(max-width: 900px) 100vw, 640px"
          className="scale-110 object-cover opacity-30 blur-sm"
          aria-hidden="true"
        />
      ) : null}
      <div className="relative z-10 flex flex-col items-center gap-1">
        <span
          className={cn(
            "font-heading text-5xl font-extrabold tracking-tight select-none",
            gameImage ? "text-foreground/60" : "text-foreground/20",
          )}
        >
          {mono}
        </span>
        <span className="text-xs text-faint">No photo yet</span>
      </div>
    </div>
  );
}

export function ListingGallery({ images, title, mono, gameImage }: Props) {
  const [active, setActive] = useState(0);
  // Track URLs that 404/failed so a broken image degrades to the mono cover.
  const [broken, setBroken] = useState<Record<string, true>>({});

  if (images.length === 0) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-secondary">
        <MonoCover mono={mono} gameImage={gameImage} />
      </div>
    );
  }

  const current = Math.min(active, images.length - 1);
  const currentSrc = images[current];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-secondary">
        {broken[currentSrc] ? (
          <MonoCover mono={mono} gameImage={gameImage} />
        ) : (
          <Image
            src={currentSrc}
            alt={`${title} — image ${current + 1} of ${images.length}`}
            fill
            sizes="(max-width: 900px) 100vw, 640px"
            className="object-cover"
            priority
            onError={() => setBroken((b) => ({ ...b, [currentSrc]: true }))}
          />
        )}
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
                {broken[src] ? (
                  <span className="grid size-full place-items-center bg-secondary text-[10px] text-faint">
                    ✕
                  </span>
                ) : (
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-cover"
                    onError={() => setBroken((b) => ({ ...b, [src]: true }))}
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
