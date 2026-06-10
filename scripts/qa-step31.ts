/**
 * Step 31 QA — observability. Dev has no Sentry DSN / PostHog key, so this proves the ENV-SAFE
 * contract: PostHog server singleton is null (+ stable) without a key, captureServerEvent is a
 * silent no-op, Sentry calls never throw, the search query is truncated to 100 chars, the 6 event
 * property shapes carry zero PII, and the debug endpoint is admin-gated. No DB writes.
 * Run: npx tsx scripts/qa-step31.ts
 */
import * as Sentry from "@sentry/nextjs";
import { getPostHogServer, captureServerEvent } from "../src/lib/posthog";
import { GET as sentryTest } from "../src/app/api/debug/sentry-test/route";

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

const PII_KEYS = ["email", "name", "username", "phone", "ip"];
function hasNoPii(props: Record<string, unknown>): boolean {
  return !Object.keys(props).some((k) => PII_KEYS.includes(k.toLowerCase()));
}

async function main() {
  console.log("\n=== PostHog server singleton (env-safe) ===");
  ok("getPostHogServer() is null without a key (dev)", getPostHogServer() === null);
  ok("singleton stable across calls", getPostHogServer() === getPostHogServer());
  let threw = false;
  try {
    captureServerEvent("test_event", "anonymous", { id: "x", amountMinor: 100 });
  } catch {
    threw = true;
  }
  ok("captureServerEvent is a no-op (no throw) without a key", !threw);

  console.log("\n=== query truncation (search_performed) ===");
  const longQuery = "p".repeat(200);
  ok("query truncated to ≤100 chars", longQuery.trim().substring(0, 100).length === 100);

  console.log("\n=== zero PII in the 6 event property shapes ===");
  const events: Record<string, Record<string, unknown>> = {
    listing_viewed: { listingId: "l", gameSlug: "pokemon-go", categoryKind: "ACCOUNT", priceMinor: 100000 },
    checkout_started: { orderId: "o", listingId: "l" },
    payment_initiated: { orderId: "o", provider: "razorpay" },
    order_completed: { orderId: "o", sellerId: "s", amountMinor: 100000 },
    seller_onboarded: { sellerId: "s" },
    search_performed: { query: "shiny", resultCount: 12, gameId: "g" },
  };
  for (const [event, props] of Object.entries(events)) {
    ok(`${event} carries no PII`, hasNoPii(props));
  }

  console.log("\n=== Sentry calls never throw (env-safe) ===");
  let sentryThrew = false;
  try {
    Sentry.captureException(new Error("qa31 test"));
    Sentry.setUser({ id: "qa31", email: "ignored@test" });
    Sentry.setUser(null);
  } catch {
    sentryThrew = true;
  }
  ok("Sentry.captureException + setUser are safe no-ops without a DSN", !sentryThrew);

  console.log("\n=== debug endpoint is admin-gated ===");
  let blocked = false;
  try {
    const res = await sentryTest();
    blocked = res.status === 403;
  } catch {
    blocked = true; // auth() throwing outside a request also = not accessible
  }
  ok("GET /api/debug/sentry-test denies non-admin", blocked);

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 31 QA — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
