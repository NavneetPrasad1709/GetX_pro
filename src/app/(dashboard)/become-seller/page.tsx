import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailWarningIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BecomeSellerForm } from "@/components/auth/become-seller-form";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

export const metadata: Metadata = { title: "Become a seller" };

export default async function BecomeSellerPage() {
  const session = await requireUser();

  // Fresh DB read — verification may have happened after login (stale JWT).
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      emailVerified: true,
      sellerProfile: { select: { id: true } },
    },
  });
  if (!user) redirect("/login");
  if (user.sellerProfile) redirect("/dashboard"); // already a seller

  // Selling requires a verified email (guardrails §7) — the service re-checks too.
  if (!user.emailVerified) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MailWarningIcon className="size-4 text-amber-400" />
              Verify your email first
            </CardTitle>
            <CardDescription>
              Sellers handle real money, so we need a verified email for{" "}
              <span className="font-medium text-foreground">{user.email}</span>{" "}
              before opening your shop.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResendVerificationForm defaultEmail={user.email} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Become a seller</CardTitle>
          <CardDescription>
            Create your seller profile and a wallet, then{" "}
            <span className="font-medium text-foreground">verify your ID</span> —
            every seller is ID-verified before they can list, so buyers can
            trust the marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BecomeSellerForm />
        </CardContent>
      </Card>
    </div>
  );
}
