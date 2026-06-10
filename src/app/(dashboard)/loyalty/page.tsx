import type { Metadata } from "next";
import Link from "next/link";
import { GiftIcon, SparklesIcon, TicketPercentIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getLoyaltyBalance, getLoyaltyHistory } from "@/server/services/loyalty";
import { pointsToMinorUnits } from "@/config/loyalty";
import { formatMoney } from "@/lib/money";
import { LoyaltyHistory } from "@/components/loyalty/loyalty-history";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Rewards", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoyaltyPage() {
  const session = await requireUser();
  const [balance, history] = await Promise.all([
    getLoyaltyBalance(session.user.id),
    getLoyaltyHistory(session.user.id, 50),
  ]);
  const worthMinor = pointsToMinorUnits(balance);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <SparklesIcon className="size-6 text-primary" aria-hidden="true" />
          GETX Rewards
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Earn points on every purchase and redeem them as a discount at checkout.
        </p>
      </div>

      {/* Balance */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardDescription>Your points balance</CardDescription>
          <CardTitle className="text-4xl font-extrabold tabular-nums">
            {balance.toLocaleString("en-IN")}
            <span className="ml-2 text-base font-medium text-muted-foreground">pts</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Worth up to{" "}
            <span className="font-semibold text-foreground">{formatMoney(worthMinor, "INR")}</span>{" "}
            off your next orders. Points are non-transferable and can&apos;t be cashed out.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TicketPercentIcon className="size-4 text-primary" aria-hidden="true" />
              Redeem at checkout
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Spend points on the checkout page for an instant discount — 100 pts = ₹10. The discount
            is capped per order; the rest stays in your balance.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GiftIcon className="size-4 text-primary" aria-hidden="true" />
              Refer &amp; earn
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Invite friends for fee credits on both sides.{" "}
            <Link href="/referrals" className="font-semibold text-primary hover:underline">
              Open Refer &amp; earn →
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Points activity</CardTitle>
        </CardHeader>
        <CardContent>
          <LoyaltyHistory rows={history} />
        </CardContent>
      </Card>
    </div>
  );
}
