/**
 * Prompt 23 QA — the AI layer's env-safe degradation contract. Verifies that with
 * NO ANTHROPIC_API_KEY the layer returns null/false and never throws (so every AI
 * feature degrades gracefully), that the client gates on the key, and that the
 * model map matches CLAUDE.md §3. No network calls — the keyed path only constructs
 * the client object, it never hits the API.
 * Run: npx tsx scripts/qa-ai.ts
 */
import { z } from "zod";
import {
  getAnthropic,
  isAiEnabled,
  generateText,
  generateJSON,
  AI_MODELS,
} from "../src/lib/ai";

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
const resetSingleton = () => {
  (globalThis as unknown as { anthropic?: unknown }).anthropic = undefined;
};

async function main() {
  const saved = process.env.ANTHROPIC_API_KEY;

  try {
    console.log("\n=== unkeyed: graceful degradation ===");
    delete process.env.ANTHROPIC_API_KEY;
    resetSingleton();
    ok("isAiEnabled() === false when unkeyed", isAiEnabled() === false);
    ok("getAnthropic() === null when unkeyed", getAnthropic() === null);
    ok(
      "generateText returns null without throwing",
      (await generateText({ prompt: "hi" })) === null,
    );
    ok(
      "generateJSON returns null without throwing",
      (await generateJSON({ schema: z.object({ x: z.number() }), prompt: "hi" })) === null,
    );

    console.log("\n=== keyed: client gates on the key (no API call) ===");
    resetSingleton();
    process.env.ANTHROPIC_API_KEY = "sk-ant-fake-for-test";
    ok("getAnthropic() non-null when keyed", getAnthropic() !== null);
    ok("isAiEnabled() === true when keyed", isAiEnabled() === true);

    console.log("\n=== model map (CLAUDE.md §3) ===");
    ok("default = claude-sonnet-4-6", AI_MODELS.default === "claude-sonnet-4-6");
    ok("reasoning = claude-opus-4-8", AI_MODELS.reasoning === "claude-opus-4-8");
    ok("fast = claude-haiku-4-5", AI_MODELS.fast === "claude-haiku-4-5");

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    resetSingleton();
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
