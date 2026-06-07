import type { Metadata } from "next";

/**
 * Auth pages layout: centered single card, mobile-first.
 * Visual polish lands in Step 04 — keep this clean + functional.
 */

// Auth pages carry zero search value and shouldn't appear in results —
// belt (robots.ts disallow) AND suspenders (noindex for anything that
// reaches these pages via off-site links robots.txt can't cover).
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
