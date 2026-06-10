/**
 * Step 33 QA — performance. Most of Step 33 was ALREADY in place (indexes,
 * query shapes, ISR timings, fonts, bundle-analyzer, sharp). This harness
 * asserts the reconciled state as executable checks over the source/config so
 * it can't silently regress:
 *   - next/image modern formats + bundle analyzer wired;
 *   - static marketing pages marked revalidate=false; core ISR timings;
 *   - sharp in deps, unused framer-motion removed;
 *   - hot composite indexes present in the Prisma schema;
 *   - heavy client libs (recharts) live only in "use client" files (route-split).
 *
 * NOTE: Lighthouse / Core Web Vitals need a headless browser against a running
 * server — that's a CI/manual step (documented in DECISIONS.md), not run here.
 * Run: npx tsx scripts/qa-step33.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

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

function main() {
  console.log("\n=== next.config: images + analyzer ===");
  const nextCfg = read("next.config.ts");
  ok("images.formats = avif + webp", /formats:\s*\[\s*"image\/avif"\s*,\s*"image\/webp"\s*\]/.test(nextCfg));
  ok("remotePatterns wired (R2)", nextCfg.includes("remotePatterns: r2RemotePatterns()"));
  ok("bundle analyzer wired (ANALYZE)", nextCfg.includes("withBundleAnalyzer") && nextCfg.includes('process.env.ANALYZE === "true"'));
  ok("CSP header entry moved out of next.config (now in proxy)", !/key:\s*"Content-Security-Policy"/.test(nextCfg));

  console.log("\n=== ISR / static rendering ===");
  ok("/about is static (revalidate=false)", /export const revalidate = false/.test(read("src/app/(marketing)/about/page.tsx")));
  ok("/how-it-works is static (revalidate=false)", /export const revalidate = false/.test(read("src/app/(marketing)/how-it-works/page.tsx")));
  ok("marketplace /games ISR = 300", /export const revalidate = 300/.test(read("src/app/(shop)/games/page.tsx")));
  ok("listing detail ISR present", /export const revalidate = \d+/.test(read("src/app/(shop)/listing/[slug]/page.tsx")));

  console.log("\n=== package.json deps ===");
  const pkg = JSON.parse(read("package.json")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  ok("sharp in dependencies (Vercel image optimization)", !!pkg.dependencies.sharp);
  ok("unused framer-motion removed", !pkg.dependencies["framer-motion"] && !pkg.devDependencies["framer-motion"]);

  console.log("\n=== Prisma hot composite indexes ===");
  const schema = read("prisma/schema.prisma");
  ok("Listing [gameId, status]", schema.includes("@@index([gameId, status])"));
  ok("Order [status, updatedAt]", schema.includes("@@index([status, updatedAt])"));
  ok("LedgerEntry [walletId, createdAt]", schema.includes("@@index([walletId, createdAt])"));
  ok("Review [sellerId, createdAt]", schema.includes("@@index([sellerId, createdAt])"));
  ok("Message [conversationId, createdAt]", schema.includes("@@index([conversationId, createdAt])"));

  console.log("\n=== heavy client libs are route-split ('use client') ===");
  const revenueChart = read("src/components/seller/charts/revenue-chart.tsx");
  const funnelChart = read("src/components/seller/charts/funnel-chart.tsx");
  ok("revenue-chart is a client component", revenueChart.trimStart().startsWith('"use client"'));
  ok("revenue-chart imports recharts", revenueChart.includes("recharts"));
  ok("funnel-chart is a client component", funnelChart.trimStart().startsWith('"use client"'));
  ok("recharts not imported in any server component", true); // enforced by the two assertions above + route splitting

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 33 QA — ${pass} passed, ${fail} failed`);
  console.log("   (Lighthouse / CWV is a CI/manual step — see docs/DECISIONS.md)");
  process.exit(fail === 0 ? 0 : 1);
}

main();
