import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

export const metadata: Metadata = {
  title: "Contact Us",
  description: `Contact GETX — Discord, email, and expected response times.`,
};

export default function ContactPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-2xl">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Contact Us" }]} />

        <header className="mt-6 mb-8">
          <h1 className="font-heading text-[clamp(26px,4vw,36px)] font-extrabold">Contact Us</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            We&apos;re a small team — the fastest route is Discord or email.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <a
            href="https://discord.gg/getx"
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#5865F2]/15 text-[#5865F2] font-bold text-lg">
              D
            </div>
            <div>
              <p className="font-heading font-bold text-foreground">Discord Community</p>
              <p className="text-[13.5px] text-muted-foreground">
                discord.gg/getx — fastest response, usually within an hour.
              </p>
            </div>
          </a>

          <a
            href="mailto:support@getx.live"
            className="flex items-center gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
              @
            </div>
            <div>
              <p className="font-heading font-bold text-foreground">Email</p>
              <p className="text-[13.5px] text-muted-foreground">
                support@getx.live — we aim to reply within 24 hours.
              </p>
            </div>
          </a>
        </div>

        <p className="mt-6 text-[13px] text-faint">
          For order disputes please use the dispute system on your orders page — it&apos;s
          faster and keeps all evidence in one place.
        </p>
      </PageContainer>
    </main>
  );
}
