import { siteConfig } from "@/config/site";

/**
 * WebSite + SearchAction JSON-LD (P9-T2) — declares the site's search endpoint
 * so Google can offer a Sitelinks Search Box for branded queries (and protects
 * the head term). Rendered once in the root layout beside OrganizationJsonLd.
 * Static admin config, `<`-escaped (same pattern as OrganizationJsonLd).
 */
const WEBSITE_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteConfig.name,
  url: siteConfig.url,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteConfig.url}/marketplace?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
}).replace(/</g, "\\u003c");

export function WebsiteJsonLd() {
  return (
    <script
      type="application/ld+json"
      // Static, admin-authored config — no user content. Pre-escaped above.
      dangerouslySetInnerHTML={{ __html: WEBSITE_JSON_LD }}
    />
  );
}
