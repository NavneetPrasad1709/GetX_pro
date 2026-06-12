import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SELLER_LEVELS } from "@/server/services/trust-score";
import { SellerLevelBadge } from "@/components/shared/seller-level-badge";

type Props = {
  currentLevel: string;
  trustScore: number;
  totalSales: number;
  kycApproved: boolean;
  disputeRatePct: number;
};

export function LevelProgressPanel({
  currentLevel,
  trustScore,
  totalSales,
  kycApproved,
  disputeRatePct,
}: Props) {
  const currentIdx = SELLER_LEVELS.findIndex((l) => l.id === currentLevel);
  const next = currentIdx < SELLER_LEVELS.length - 1 ? SELLER_LEVELS[currentIdx + 1] : null;
  const current = SELLER_LEVELS[currentIdx] ?? SELLER_LEVELS[0];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      {/* Current level */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Your Level</p>
          <SellerLevelBadge level={currentLevel} size="md" />
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-1">Trust Score</p>
          <p className="text-2xl font-bold text-foreground">{trustScore}<span className="text-sm text-muted-foreground">/100</span></p>
        </div>
      </div>

      {/* Perks */}
      <div className="grid grid-cols-2 gap-3">
        <Perk label="Commission discount" value={`-${current.perks.commissionDiscountPct}%`} />
        <Perk label="Payout speed" value={`${current.perks.payoutSpeedDays} day${current.perks.payoutSpeedDays > 1 ? "s" : ""}`} />
        <Perk label="Featured eligible" value={current.perks.featuredEligible ? "Yes" : "No"} />
      </div>

      {/* Next level requirements */}
      {next && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Next: <SellerLevelBadge level={next.id} size="xs" className="ml-1" />
          </p>
          <ul className="space-y-2">
            <RequirementRow
              done={trustScore >= next.minTrustScore}
              label={`Trust score ≥ ${next.minTrustScore}`}
              current={`${trustScore}`}
            />
            <RequirementRow
              done={totalSales >= next.minTotalSales}
              label={`${next.minTotalSales} completed sales`}
              current={`${totalSales}`}
            />
            {next.requiresKyc && (
              <RequirementRow
                done={kycApproved}
                label="KYC verified"
                current={kycApproved ? "Done" : "Pending"}
              />
            )}
            {next.maxDisputeRatePct !== null && (
              <RequirementRow
                done={disputeRatePct <= next.maxDisputeRatePct}
                label={`Dispute rate ≤ ${next.maxDisputeRatePct}%`}
                current={`${disputeRatePct.toFixed(1)}%`}
              />
            )}
          </ul>
        </div>
      )}

      {currentLevel === "ELITE" && (
        <p className="text-sm text-primary font-medium text-center">
          Elite — highest level. Keep delivering great service!
        </p>
      )}
    </div>
  );
}

function Perk({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function RequirementRow({
  done,
  label,
  current,
}: {
  done: boolean;
  label: string;
  current: string;
}) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2Icon className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
      ) : (
        <CircleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className={cn("flex-1", done && "line-through text-muted-foreground")}>
        {label}
      </span>
      <span className={cn("text-xs font-mono", done ? "text-emerald-400" : "text-muted-foreground")}>
        {current}
      </span>
    </li>
  );
}
