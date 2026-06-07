import { ZapIcon, ShieldCheckIcon } from "lucide-react";
import { PageContainer } from "@/components/shared/page-container";
import { SectionHeading } from "@/components/shared/section-heading";
import { AiSparkIcon, RupeeCircleIcon } from "@/components/shared/icons";

const FEATURES: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
}[] = [
  {
    icon: ZapIcon,
    title: "Instant delivery",
    body: "Auto-delivery for top-ups, fast verified hand-off for accounts. No waiting around.",
  },
  {
    icon: AiSparkIcon,
    title: "AI Dispute Judge",
    body: "Fair verdicts in minutes, not days. Reads the chat & proof, decides quickly.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Live Trust Score",
    body: "Real-time seller trust you can actually see — updates with their behaviour.",
  },
  {
    icon: RupeeCircleIcon,
    title: "Lowest fees",
    body: "Keep more of what you earn. UPI + crypto, no surprise charges.",
  },
];

/** "Why GETX" band (v10 ".features") — the four differentiators. */
export function WhyGetx() {
  return (
    <section className="border-t border-border py-10 min-[761px]:py-12 min-[1025px]:py-[62px]">
      <PageContainer>
        <SectionHeading
          kicker="Why GETX"
          title="Built different — fast & safe"
          description="The stuff other marketplaces are slow at, we do in minutes."
          className="mb-5 min-[761px]:mb-7"
        />

        <div className="grid grid-cols-1 gap-3.5 min-[431px]:grid-cols-2 min-[901px]:grid-cols-4 min-[901px]:gap-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-lg border border-border bg-card p-[18px] min-[761px]:p-[22px]"
            >
              <div className="mb-2.5 grid size-10 place-items-center rounded-xl bg-primary/12 text-primary min-[761px]:mb-3.5 min-[761px]:size-[46px]">
                <Icon className="size-5 min-[761px]:size-[23px]" aria-hidden="true" />
              </div>
              <h3 className="text-[14.5px] font-semibold min-[761px]:text-base">
                {title}
              </h3>
              <p className="mt-[5px] text-[12.5px] leading-normal text-muted-foreground min-[761px]:mt-[7px] min-[761px]:text-[13.5px]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
