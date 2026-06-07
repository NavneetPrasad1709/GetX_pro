/**
 * Money formatting — ALL amounts are stored as integer minor units
 * (paisa/cents), never floats (see docs/ENGINEERING-GUARDRAILS.md §1).
 * This module only *formats* for display; it never does business math.
 */

/** Minor-unit precision per currency. */
const CURRENCY_DECIMALS: Record<string, number> = {
  INR: 2,
  USD: 2,
  USDT: 2,
  BTC: 8,
  ETH: 8,
};

const CRYPTO_SYMBOL: Record<string, string> = {
  USDT: "$",
  USD: "$",
  BTC: "₿",
  ETH: "Ξ",
};

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

/**
 * Format integer minor units → human currency string.
 * @example formatMoney(49900) -> "₹499.00"
 * @example formatMoney(1500, "USDT") -> "$15.00"
 */
export function formatMoney(amountMinor: number, currency = "INR"): string {
  const code = currency.toUpperCase();
  const decimals = currencyDecimals(code);
  const major = amountMinor / 10 ** decimals;

  if (code === "INR" || code === "USD") {
    return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  }

  // Crypto / stablecoins: symbol + trimmed decimals (keep at least 2).
  const symbol = CRYPTO_SYMBOL[code] ?? "";
  const text = major.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${text}${symbol ? "" : ` ${code}`}`;
}

/** Compact large counts: 1234 -> "1.2K", 1_500_000 -> "1.5M". */
export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/**
 * Parse a human price string ("499", "499.5", "499.99") into integer minor
 * units using PURE STRING/INTEGER math — never parseFloat (0.1+0.2 bugs).
 * Returns null for anything that isn't a plain positive decimal with at most
 * `currencyDecimals(currency)` fraction digits.
 * @example parsePriceToMinor("499.99") -> 49999
 */
export function parsePriceToMinor(
  input: string,
  currency = "INR",
): number | null {
  const decimals = currencyDecimals(currency);
  const cleaned = input.trim().replace(/,/g, ""); // allow "1,499.00"
  const match = cleaned.match(/^(\d{1,10})(?:\.(\d+))?$/);
  if (!match) return null;

  const [, whole, fraction = ""] = match;
  if (fraction.length > decimals) return null; // sub-minor precision = invalid

  const minor =
    parseInt(whole, 10) * 10 ** decimals +
    (fraction ? parseInt(fraction.padEnd(decimals, "0"), 10) : 0);
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Integer minor units -> plain major-unit string for form inputs
 * ("49999" -> "499.99", trailing ".00" trimmed). Display-only counterpart
 * of parsePriceToMinor — string math, no floats.
 */
export function minorToMajorString(amountMinor: number, currency = "INR"): string {
  const decimals = currencyDecimals(currency);
  const s = Math.abs(amountMinor).toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals) || "0";
  const fraction = s.slice(-decimals).replace(/0+$/, "");
  return `${amountMinor < 0 ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
