import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

export const metadata: Metadata = {
  title: "Careers",
  description: `Work at GETX — we're a small team building the best gaming marketplace in India.`,
};

export default function CareersPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-2xl">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Careers" }]} />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">Careers</h1>
        </header>

        <div className="flex flex-col gap-6 font-sans text-[15px] leading-relaxed text-muted-foreground">
          <p>
            We&apos;re a small team building the best gaming marketplace in India. We move fast,
            care deeply about the product, and genuinely love games.
          </p>
          <p>
            If you&apos;re passionate about gaming and want to help shape a platform that millions
            of Indian gamers will use, we&apos;d love to hear from you — even if we don&apos;t
            have a specific role open right now.
          </p>
          <p>
            Reach out at{" "}
            <a href="mailto:support@getx.live" className="text-primary hover:underline">
              support@getx.live
            </a>{" "}
            with the subject line &quot;Careers&quot; and tell us what you&apos;d build.
          </p>
        </div>
      </PageContainer>
    </main>
  );
}
