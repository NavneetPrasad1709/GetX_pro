import { ChevronDownIcon } from "lucide-react";

/**
 * Zero-JS FAQ accordion (Prompt 17) — native <details>/<summary> so it works on
 * every device with no client bundle. Content is admin-authored config (never
 * user input). Pair with FAQPage JSON-LD on the page for rich-result eligibility.
 */
export function FaqAccordion({
  faqs,
}: {
  faqs: { q: string; a: string }[];
}) {
  if (faqs.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {faqs.map((f) => (
        <details
          key={f.q}
          className="group rounded-lg border border-border bg-card/40 px-4 py-3"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            {f.q}
            <ChevronDownIcon
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            {f.a}
          </p>
        </details>
      ))}
    </div>
  );
}

/** FAQPage JSON-LD string (escaped). Returns null when there are no FAQs. */
export function faqPageJsonLd(faqs: { q: string; a: string }[]): string | null {
  if (faqs.length === 0) return null;
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
