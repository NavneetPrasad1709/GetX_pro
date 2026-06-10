import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Seller area gate (/seller/**): a SellerProfile must exist — that's the real
 * permission (role alone could be stale in the JWT). No profile → onboarding.
 * The (dashboard) layout above already enforced login and renders the app shell;
 * seller navigation now lives in the shell sidebar (Prompt 06), so this layout
 * is a thin gate only.
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

  return <>{children}</>;
}
