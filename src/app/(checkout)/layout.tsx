import { CheckoutHeader } from "@/components/layout/checkout-header";

/**
 * Checkout shell (Prompt 01) — minimal header (logo + green-lock "Secure
 * checkout"). No footer, no Sell CTA, no bottom nav. Auth is gated in
 * checkout/page.tsx, which (unlike a layout) receives searchParams and can
 * build a listing-aware /login?callbackUrl so a logged-out buyer returns to
 * THIS checkout after signing in instead of a generic dashboard (P1-T2).
 */
export default async function CheckoutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <CheckoutHeader />
      {/* pb clears the fixed mobile pay bar on ≤900px (no bottom nav here) */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-8 pb-[74px] min-[901px]:pb-8">
        {children}
      </main>
    </>
  );
}
