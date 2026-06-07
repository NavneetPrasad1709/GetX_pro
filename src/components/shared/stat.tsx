import { cn } from "@/lib/utils";

type Props = {
  value: React.ReactNode;
  label: string;
  icon?: React.ReactNode;
  className?: string;
};

/** Compact metric: big value + small caption (trust counters, KPIs). */
export function Stat({ value, label, icon, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="flex items-center gap-1.5 font-heading text-xl font-bold tabular-nums text-foreground [&>svg]:size-4 [&>svg]:text-primary">
        {icon}
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
