/**
 * Locale-aware formatting (Step 23). Use in components that render prices/dates
 * so Hindi pages get `hi-IN` grouping/numerals where the platform applies them.
 * Money is integer minor units (paisa) everywhere — divide by 100 only for display.
 */
type Locale = "en" | "hi";

const intlLocale = (locale: string): string => (locale === "hi" ? "hi-IN" : "en-IN");

/** Integer minor units (paisa) → localised ₹ string, no decimals. */
export function formatCurrency(amountMinor: number, locale: Locale | string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

/** A short, localised date (e.g. "11 Jun 2026" / "११ जून २०२६"). */
export function formatDate(date: Date | string, locale: Locale | string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}
