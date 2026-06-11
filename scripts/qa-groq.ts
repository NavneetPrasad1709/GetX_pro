/**
 * Live Groq smoke test (Step 23 deploy) — confirms the free AI fallback actually
 * works end to end: provider detection, text generation, JSON generation, and
 * streaming, all against the real Groq API using GROQ_API_KEY from .env.
 * Run: npx tsx scripts/qa-groq.ts
 */
process.loadEnvFile(); // load .env into process.env (Node 22+)

import { z } from "zod";
import { isAiEnabled, generateText, generateJSON, streamSupportResponse } from "../src/lib/ai";

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

async function main() {
  ok("AI enabled (a provider key is set)", isAiEnabled());
  ok("running on Groq (no Anthropic key)", !process.env.ANTHROPIC_API_KEY && !!process.env.GROQ_API_KEY);

  console.log("\n=== generateText ===");
  const text = await generateText({ prompt: "Reply with exactly the word: PONG" });
  ok("returns non-null text", typeof text === "string" && text.length > 0, JSON.stringify(text));
  console.log(`    model said: ${text?.slice(0, 60)}`);

  console.log("\n=== generateJSON (structured) ===");
  const schema = z.object({ capital: z.string(), country: z.string() });
  const json = await generateJSON({
    schema,
    prompt: "What is the capital of France? Return {capital, country}.",
  });
  ok("returns a valid parsed object", json !== null && typeof json.capital === "string", JSON.stringify(json));
  console.log(`    parsed: ${JSON.stringify(json)}`);

  console.log("\n=== streamSupportResponse (SSE) ===");
  let streamed = "";
  for await (const delta of streamSupportResponse(
    [{ role: "user", content: "Say hi in 3 words." }],
    "You are a concise helper.",
  )) {
    streamed += delta;
  }
  ok("stream yields text", streamed.length > 0, streamed.slice(0, 60));
  console.log(`    streamed: ${streamed.slice(0, 80)}`);

  console.log(`\n${fail === 0 ? "✅" : "❌"} Groq smoke test — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
