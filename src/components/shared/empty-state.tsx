import { cn } from "@/lib/utils";

type Props = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Optional CTA (e.g. a <Button>). */
  action?: React.ReactNode;
  className?: string;
  /**
   * Heading tag for the title. Use "h2" when the empty state sits directly
   * under the page <h1> (games index, category page) so the document outline
   * never skips a level; the "h3" default suits placement after an h2.
   */
  headingLevel?: "h2" | "h3";
};

/** Friendly empty/zero-data state for lists, search, dashboards. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  headingLevel: Heading = "h3",
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-6">
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <Heading className="text-base font-semibold">{title}</Heading>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
