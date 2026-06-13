import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getReferralStats } from "@/server/services/referral";
import { referralConfig } from "@/config/referral";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReferralShare } from "@/components/referral/referral-share";

export const metadata: Metadata = {
  title: "Refer & earn",
  robots: { index: false },
};

/**
 * Referral dashboard (Prompt 22). Shows the user's share link, earned credit, and
 * referral history. Rewards accrue as fee-credit (paise) until Step 21 loyalty ships.
 */
export default async function ReferralsPage() {
  if (!siteConfig.features.referral) notFound(); // refer-and-earn hidden for now (owner)
  const session = await requireUser();
  const stats = await getReferralStats(session.user.id);

  const cards = [
    { label: "Credit balance", value: formatMoney(stats.creditMinor) },
    { label: "Friends joined", value: String(stats.completed + stats.pending) },
    { label: "Completed", value: String(stats.completed) },
    { label: "Earned", value: formatMoney(stats.earnedMinor) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Refer &amp; earn</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your link. Your friend gets {formatMoney(referralConfig.buyer.refereeSignupMinor)}{" "}
          welcome credit, and you earn {formatMoney(referralConfig.buyer.referrerRewardMinor)} when
          they complete their first order.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your referral link</CardTitle>
          <CardDescription>
            Code: <span className="font-mono font-semibold text-foreground">{stats.code}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReferralShare url={stats.shareUrl} code={stats.code} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} size="sm">
            <CardHeader>
              <CardDescription>{c.label}</CardDescription>
              <CardTitle className="text-xl font-bold tabular-nums">{c.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referral history</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No referrals yet — share your link to start earning.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Friend</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.history.map((h) => (
                    <tr key={h.id} className="border-t border-border">
                      <td className="py-2">{h.refereeLabel}</td>
                      <td className="py-2">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            h.status === "COMPLETED"
                              ? "bg-success/12 text-success"
                              : h.status === "VOIDED"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {h.status === "COMPLETED"
                            ? "Completed"
                            : h.status === "VOIDED"
                              ? "Voided"
                              : "Pending"}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {h.status === "COMPLETED" ? formatMoney(h.rewardMinor) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Credit is applied to future orders. Rewards unlock only when a referred friend completes a
        genuine order (after escrow release) — this keeps the program fair for everyone.
      </p>
    </div>
  );
}
