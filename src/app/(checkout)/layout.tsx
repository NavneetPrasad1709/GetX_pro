import { requireUser } from "@/lib/auth";
import { CheckoutHeader } from "@/components/layout/checkout-header";

/**
 * Checkout shell (Prompt 01) — minimal header (logo + green-lock "Secure
 * checkout"). No footer, no Sell CTA, no bottom nav. Auth gate kept here so
 * /checkout stays login-protected after moving out of the (dashboard) group.
 */
export default async function CheckoutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser(); // real auth gate — do not remove

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
