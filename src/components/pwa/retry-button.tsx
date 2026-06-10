"use client";

/** Tiny client island for the offline page's reload action (Step 24). */
export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary-strong px-6 py-3 font-heading text-base font-bold text-primary-foreground transition-colors hover:bg-primary-strong-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      Try again
    </button>
  );
}
