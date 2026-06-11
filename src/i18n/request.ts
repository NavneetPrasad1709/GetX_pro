import { getRequestConfig } from "next-intl/server";
import { IntlErrorCode } from "next-intl";
import * as Sentry from "@sentry/nextjs";
import { routing, type AppLocale } from "./routing";

/**
 * Per-request i18n config (Step 23). Resolves the locale from the URL, loads the
 * matching message catalog, and — crucially — NEVER lets a bad locale or a
 * missing key crash a page:
 *   • unknown/missing locale → default;
 *   • catalog import fails → fall back to the English catalog;
 *   • missing key at runtime → render the key path + log a warning (Sentry if a
 *     DSN is set, else console). A translation gap must never 500 a page.
 */
async function loadMessages(locale: AppLocale) {
  try {
    return (await import(`../../messages/${locale}.json`)).default;
  } catch {
    // e.g. a deleted/corrupt hi.json — degrade to English rather than crash.
    return (await import(`../../messages/en.json`)).default;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: AppLocale = routing.locales.includes(requested as AppLocale)
    ? (requested as AppLocale)
    : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
          Sentry.captureMessage(`i18n missing message: ${error.message}`, "warning");
        } else {
          console.warn(`[i18n] ${error.message}`);
        }
        return; // swallow — don't throw
      }
      // Other IntlErrors (formatting etc.) — log, don't crash.
      console.warn(`[i18n] ${error.message}`);
    },
    getMessageFallback({ namespace, key }) {
      // Render the key path instead of an error string when a message is missing.
      return [namespace, key].filter(Boolean).join(".");
    },
  };
});
