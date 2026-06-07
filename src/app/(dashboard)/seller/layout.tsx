import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { SellerNavLinks } from "@/components/seller/seller-nav-links";

/**
 * Seller area gate (/seller/**): a SellerProfile must exist — that's the real
 * permission (role alone could be stale in the JWT). No profile → onboarding.
 * The (dashboard) layout above already enforced login.
 */
export default async function SellerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireUser();

  const profile = await db.sellerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/become-seller");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SellerNavLinks />
        <Button render={<Link href="/seller/listings/new" />} size="sm">
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          New listing
        </Button>
      </div>
      {children}
    </div>
  );
}
