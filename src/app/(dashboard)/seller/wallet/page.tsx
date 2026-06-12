import type { Metadata } from "next";
import { ClockIcon, LockIcon, WalletIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  getLedgerHistory,
  getMyPayouts,
  getWalletOverview,
} from "@/server/services/payouts";
import { getPayoutAccountView } from "@/server/services/payout-accounts";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestPayoutForm } from "@/components/wallet/request-payout-form";
import { PayoutAccountForm } from "@/components/wallet/payout-account-form";
import { LedgerHistory } from "@/components/wallet/ledger-history";
import { PayoutStatusBadge } from "@/components/wallet/payout-status-badge";

export const metadata: Metadata = { title: "Wallet", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const METHOD_LABEL: Record<string, string> = {
  RAZORPAY: "Bank / UPI",
  CRYPTO: "Crypto",
};

export default async function SellerWalletPage() {
  const session = await requireUser();
  const [overview, ledger, payouts, payoutAccount] = await Promise.all([
    getWalletOverview(session.user.id),
    getLedgerHistory(session.user.id, { limit: 15 }),
    getMyPayouts(session.user.id),
    getPayoutAccountView(session.user.id),
  ]);

  const cards = [
    {
      icon: WalletIcon,
      label: "Available",
      value: formatMoney(overview.availableMinor, overview.currency),
      hint: "Ready to withdraw",
      tone: "text-success",
    },
    {
      icon: LockIcon,
      label: "In escrow",
      value: formatMoney(overview.heldMinor, overview.currency),
      hint: "Releases when buyers confirm",
      tone: "text-foreground",
    },
    {
      icon: ClockIcon,
      label: "Withdrawing",
      value: formatMoney(overview.pendingPayoutMinor, overview.currency),
      hint: "Payouts being processed",
      tone: "text-foreground",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your earnings, escrow and withdrawals — every number derived from your
          ledger.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[521px]:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <card.icon className="size-4" aria-hidden="true" />
                {card.label}
              </CardDescription>
              <CardTitle className={`text-2xl tabular-nums ${card.tone}`}>
                {card.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-faint">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <PayoutAccountForm saved={payoutAccount} />

      <RequestPayoutForm
        availableMinor={overview.availableMinor}
        currency={overview.currency}
        hasPayoutAccount={payoutAccount != null}
        destinationLabel={payoutAccount?.label}
      />

      {/* withdrawal history */}
      {payouts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-bold">Withdrawals</h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(p.amountMinor, overview.currency)}
                  </p>
                  <p className="text-xs text-faint">
                    {METHOD_LABEL[p.method] ?? p.method} ·{" "}
                    {dateFmt.format(new Date(p.createdAt))}
                  </p>
                </div>
                <PayoutStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ledger */}
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-bold">Transactions</h2>
        <LedgerHistory
          currency={overview.currency}
          initial={ledger.items}
          initialCursor={ledger.nextCursor}
        />
      </section>
    </div>
  );
}
