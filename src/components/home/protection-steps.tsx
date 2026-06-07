import {
  LockIcon,
  ZapIcon,
  CheckCircle2Icon,
  type LucideIcon,
} from "lucide-react";
import { PageContainer } from "@/components/shared/page-container";
import { SectionHeading } from "@/components/shared/section-heading";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: LockIcon,
    title: "You pay safely",
    body: "Your money is locked with GETX — the seller doesn't get it yet. UPI & crypto supported.",
  },
  {
    icon: ZapIcon,
    title: "You get it instantly",
    body: "The verified seller delivers the account or item. You check everything is exactly as described.",
  },
  {
    icon: CheckCircle2Icon,
    title: "Money is released",
    body: "Happy? The seller gets paid. Problem? Open a dispute — full money-back, guaranteed.",
  },
];

/** "How you're protected" band (v10 ".steps") — the escrow story in 3 cards. */
export function ProtectionSteps() {
  return (
    <section className="border-t border-border py-10 min-[761px]:py-12 min-[1025px]:py-[62px]">
      <PageContainer>
        <SectionHeading
          kicker="Trust"
          title="How you're protected"
          description="Your money is never sent straight to the seller."
          className="mb-5 min-[761px]:mb-7"
        />

        <div className="grid gap-3.5 min-[761px]:grid-cols-3 min-[761px]:gap-[18px]">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className="rounded-lg border border-border bg-card p-5 min-[761px]:p-[26px]"
            >
              <div className="mb-3 grid size-[42px] place-items-center rounded-[11px] bg-primary/12 text-primary min-[761px]:mb-4 min-[761px]:size-[50px] min-[761px]:rounded-[13px]">
                <Icon className="size-5 min-[761px]:size-6" aria-hidden="true" />
              </div>
              <span className="font-mono text-xs text-faint">STEP {i + 1}</span>
              <h3 className="mt-1 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
