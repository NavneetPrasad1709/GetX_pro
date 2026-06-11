import { defineRouting } from "next-intl/routing";

/**
 * i18n routing (Step 23). English + Hindi, English is the default and uses CLEAN
 * URLs (no `/en` prefix) — `localePrefix: 'as-needed'` → `/listing/x` for English,
 * `/hi/listing/x` for Hindi. Keeps SEO clean (no duplicate `/` vs `/en/`).
 */
export const routing = defineRouting({
  locales: ["en", "hi"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
