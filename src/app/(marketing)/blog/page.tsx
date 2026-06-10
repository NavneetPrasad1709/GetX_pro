import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/page-container";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

export const metadata: Metadata = {
  title: "Blog",
  description: `GETX Blog — tips, guides, and gaming marketplace news. Coming soon.`,
};

export default function BlogPage() {
  return (
    <main className="flex-1 py-8 min-[761px]:py-12">
      <PageContainer className="max-w-2xl">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog" }]} />

        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <span className="text-5xl" aria-hidden="true">📝</span>
          <h1 className="font-heading text-2xl font-extrabold">GETX Blog — coming soon</h1>
          <p className="max-w-[46ch] text-[15px] text-muted-foreground">
            Tips, guides, and gaming marketplace news. We&apos;re working on it — follow us on
            Discord for the latest updates in the meantime.
          </p>
          <a
            href="https://discord.gg/getx"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-2 rounded-sm bg-primary-strong px-5 py-3 font-heading text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong-hover"
          >
            Join the Discord
          </a>
        </div>
      </PageContainer>
    </main>
  );
}
