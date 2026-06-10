import type { Metadata } from "next";
import { SparklesIcon } from "lucide-react";
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

export const metadata: Metadata = { title: "Seller rewards", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SellerLoyaltyPage() {
  const session = await requireUser();
  const [balance, history] = await Promise.all([
    getLoyaltyBalance(session.user.id),
    getLoyaltyHistory(session.user.id, 100),
  ]);
  const saleRows = history.filter((r) => r.reason === "SALE");
  const worthMinor = pointsToMinorUnits(balance);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <SparklesIcon className="size-6 text-primary" aria-hidden="true" />
          Seller rewards
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You earn 1 point per ₹20 received (after commission) on every completed sale.
        </p>
      </div>

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
            when you buy on GETX. Points can&apos;t be cashed out.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sale rewards</CardTitle>
          <CardDescription>Points earned from your completed sales</CardDescription>
        </CardHeader>
        <CardContent>
          <LoyaltyHistory rows={saleRows} />
        </CardContent>
      </Card>
    </div>
  );
}
