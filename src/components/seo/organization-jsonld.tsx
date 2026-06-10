import { siteConfig } from "@/config/site";
import { socials } from "@/config/nav";

/**
 * Organization entity JSON-LD (Prompt 17) — declares GETX as an Organization for
 * Google entity authority (Knowledge Panel prerequisite). Rendered once in the
 * root layout. The payload is computed at module load (static) and `<`-escaped,
 * same pattern as Breadcrumbs.
 */
const ORG_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.name,
  url: siteConfig.url,
  logo: `${siteConfig.url}/getx-mark.webp`,
  description: siteConfig.description,
  sameAs: socials.map((s) => s.href),
}).replace(/</g, "\\u003c");

export function OrganizationJsonLd() {
  return (
    <script
      type="application/ld+json"
      // Static, admin-authored config — no user content. Pre-escaped above.
      dangerouslySetInnerHTML={{ __html: ORG_JSON_LD }}
    />
  );
}
