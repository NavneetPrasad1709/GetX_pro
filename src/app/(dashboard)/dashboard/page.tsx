import type { Metadata } from "next";
import Link from "next/link";
import { MailWarningIcon, StoreIcon, WalletIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getLedgerBalanceMinor } from "@/server/services/listings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireUser();

  // Fresh DB read — the JWT can be stale (e.g. user verified email after login).
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      sellerProfile: {
        select: {
          displayName: true,
          trustScore: true,
          kycStatus: true,
          wallet: { select: { id: true, currency: true } },
        },
      },
    },
  });
  if (!user) return null; // deleted mid-session; proxy/login will catch next nav

  // Balance = ledger truth (guardrails §1) — same source as the seller hub;
  // cachedBalanceMinor is never used for display.
  const walletBalanceMinor = user.sellerProfile?.wallet
    ? await getLedgerBalanceMinor(user.sellerProfile.wallet.id)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back{user.name ? `, ${user.name}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" render={<Link href="/orders" />}>
            Your orders
          </Button>
          <Badge variant="outline" className="font-mono uppercase">
            {user.role}
          </Badge>
        </div>
      </div>

      {!user.emailVerified && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MailWarningIcon className="size-4 text-amber-400" />
              Verify your email
            </CardTitle>
            <CardDescription>
              You can browse and buy, but selling unlocks only after you verify{" "}
              <span className="font-medium text-foreground">{user.email}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResendVerificationForm defaultEmail={user.email} />
          </CardContent>
        </Card>
      )}

      {user.sellerProfile ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <StoreIcon className="size-4 text-primary" />
              Seller — {user.sellerProfile.displayName}
            </CardTitle>
            <CardDescription>
              Trust score {user.sellerProfile.trustScore}/100 · KYC{" "}
              {user.sellerProfile.kycStatus.toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm">
              <WalletIcon className="size-4 text-muted-foreground" />
              Wallet balance:{" "}
              <span className="font-mono font-medium">
                {user.sellerProfile.wallet && walletBalanceMinor !== null
                  ? formatMoney(
                      walletBalanceMinor,
                      user.sellerProfile.wallet.currency,
                    )
                  : "—"}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/seller" />}
            >
              Open seller hub
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <StoreIcon className="size-4 text-primary" />
              Start selling on GETX
            </CardTitle>
            <CardDescription>
              Open your seller account in under a minute — get a wallet, build
              trust, sell to gamers worldwide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* default variant already styles the primary button — an explicit
                bg-primary here would override the AA-compliant -strong fill. */}
            <Button render={<Link href="/become-seller" />}>
              Become a seller
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
