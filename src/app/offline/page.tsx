import type { Metadata } from "next";
import Link from "next/link";
import { RetryButton } from "@/components/pwa/retry-button";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

/**
 * Offline fallback (Step 24). Served from the SW cache when navigation fails. MUST render with
 * zero network / DB / auth — purely static. No data-fetching imports here.
 */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-16 text-center">
      <div className="flex max-w-sm flex-col items-center gap-5">
        {/* plain <img>: works from cache even when next/image's optimizer is unreachable */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192x192.png"
          alt="GETX"
          width={88}
          height={88}
          className="rounded-2xl"
        />
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground">
          No internet connection. Your recently viewed listings and orders are cached — check back
          once you&apos;re connected.
        </p>
        <div className="flex flex-col items-center gap-3">
          <RetryButton />
          <Link
            href="/"
            className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            ← Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
