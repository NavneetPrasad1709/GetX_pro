import { ShieldCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  score?: number | null;
  className?: string;
  showIcon?: boolean;
};

function trustColor(score: number): string {
  if (score >= 80) return "text-emerald-400 bg-emerald-400/10";
  if (score >= 60) return "text-yellow-400 bg-yellow-400/10";
  if (score >= 40) return "text-orange-400 bg-orange-400/10";
  return "text-red-400 bg-red-400/10";
}

export function TrustScorePill({ score, className, showIcon = true }: Props) {
  if (score == null) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        trustColor(score),
        className,
      )}
      aria-label={`Trust score ${score} out of 100`}
    >
      {showIcon && <ShieldCheckIcon className="size-3" aria-hidden="true" />}
      {score}
    </span>
  );
}
