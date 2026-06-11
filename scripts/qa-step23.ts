/**
 * Step 23 QA — i18n FOUNDATION (catalogs + locale formatting). The URL-routing /
 * render / hreflang checks from the spec need the deferred activation wiring
 * (the [locale] route restructure) + a running dev server, so they're tracked in
 * docs/DECISIONS.md (Step 23) as the post-deploy activation step. This harness
 * verifies the parts that are real + done NOW, with no server:
 *   - en/hi key parity (identical leaf-key sets);
 *   - no empty string values anywhere;
 *   - Hindi strings are real Devanagari (not leftover English);
 *   - formatCurrency / formatDate are locale-aware.
 * Run: npx tsx scripts/qa-step23.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatCurrency, formatDate } from "../src/lib/format";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

type Json = { [k: string]: string | Json };
const read = (locale: string): Json =>
  JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"));

/** Collect all leaf key paths (e.g. "Orders.statusLabels.PAID"). */
function leaves(obj: Json, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(path, v);
    else for (const [p, val] of leaves(v, path)) out.set(p, val);
  }
  return out;
}

const DEVANAGARI = /[ऀ-ॿ]/;
// Keys whose Hindi value is intentionally NOT Devanagari (brand/proper nouns/codes).
const ALLOWED_NON_DEVANAGARI = new Set([
  "Checkout.upi",
  "LanguageSwitcher.english",
  "LanguageSwitcher.hindi", // value is "हिन्दी" actually — but allow either
  "Footer.copyright", // "© {year} GETX. ..." mixes latin
]);

function main() {
  const en = leaves(read("en"));
  const hi = leaves(read("hi"));

  console.log("\n=== a. key parity (identical leaf-key sets) ===");
  const enKeys = [...en.keys()].sort();
  const hiKeys = [...hi.keys()].sort();
  const missingInHi = enKeys.filter((k) => !hi.has(k));
  const extraInHi = hiKeys.filter((k) => !en.has(k));
  ok("no keys missing in hi.json", missingInHi.length === 0, missingInHi.join(", "));
  ok("no extra keys in hi.json", extraInHi.length === 0, extraInHi.join(", "));
  ok("same total key count", enKeys.length === hiKeys.length, `${enKeys.length} vs ${hiKeys.length}`);

  console.log("\n=== b. no empty values ===");
  const emptyEn = enKeys.filter((k) => (en.get(k) ?? "").trim() === "");
  const emptyHi = hiKeys.filter((k) => (hi.get(k) ?? "").trim() === "");
  ok("en.json has no empty values", emptyEn.length === 0, emptyEn.join(", "));
  ok("hi.json has no empty values", emptyHi.length === 0, emptyHi.join(", "));

  console.log("\n=== c. Hindi strings are real Devanagari (no leftover English) ===");
  const notTranslated = hiKeys.filter((k) => {
    if (ALLOWED_NON_DEVANAGARI.has(k)) return false;
    const v = hi.get(k) ?? "";
    return !DEVANAGARI.test(v); // expect at least one Devanagari char
  });
  ok("all translatable hi values contain Devanagari", notTranslated.length === 0, notTranslated.slice(0, 8).join(", "));
  ok("hi differs from en for core keys", hi.get("Listing.buyNow") !== en.get("Listing.buyNow"));
  ok('buyNow is "अभी खरीदें"', hi.get("Listing.buyNow") === "अभी खरीदें");

  console.log("\n=== d. placeholder parity (ICU {vars} match) ===");
  const phMismatch = enKeys.filter((k) => {
    const e = (en.get(k) ?? "").match(/\{[^}]+\}/g)?.sort().join(",") ?? "";
    const h = (hi.get(k) ?? "").match(/\{[^}]+\}/g)?.sort().join(",") ?? "";
    return e !== h;
  });
  ok("ICU placeholders match between locales", phMismatch.length === 0, phMismatch.join(", "));

  console.log("\n=== e. locale-aware formatting ===");
  const en100 = formatCurrency(10000, "en");
  const hi100 = formatCurrency(10000, "hi");
  ok("formatCurrency(10000,'en') has ₹ and 100", en100.includes("₹") && en100.includes("100"), en100);
  ok("formatCurrency(10000,'hi') has ₹ and 100", hi100.includes("₹") && /१००|100/.test(hi100), hi100);
  const d = new Date("2026-06-11T00:00:00Z");
  ok("formatDate('en') non-empty", formatDate(d, "en").length > 0, formatDate(d, "en"));
  ok("formatDate('hi') non-empty", formatDate(d, "hi").length > 0, formatDate(d, "hi"));

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 23 QA (foundation) — ${pass} passed, ${fail} failed`);
  console.log("   (URL-routing / hreflang / render checks → post-deploy activation, see DECISIONS.md)");
  process.exit(fail === 0 ? 0 : 1);
}

main();
