"use client";

import { useState } from "react";
import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accessible 1–5 star picker (radiogroup). Hover previews, click commits. */
export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div
      role="radiogroup"
      aria-label="Star rating"
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <StarIcon
            className={cn(
              "size-7 fill-current",
              n <= shown ? "text-star" : "text-muted-foreground/25",
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}
