import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { captureException } from "@sentry/nextjs";

/**
 * The unified GETX AI layer (Prompt 23) — ONE Claude client every AI feature uses.
 *
 * Operating principles (do NOT violate):
 *   • AI is the DEFAULT interface; the human is the EXCEPTION path. AI suggests,
 *     rules/humans decide money — never write a ledger row or move escrow from here.
 *   • Env-safe degradation: with no ANTHROPIC_API_KEY the client is null and every
 *     helper returns null/fallback — a feature degrades, it never crashes.
 *   • Helpers NEVER throw and must be called fire-and-forget for non-critical AI,
 *     never inside a DB transaction.
 *
 * Model policy (CLAUDE.md §3): default Sonnet for everyday tasks, Opus for hard
 * reasoning (the Dispute Judge), Haiku for fast/cheap bulk (classification, logs).
 */

const globalForAi = globalThis as unknown as { anthropic?: Anthropic | null };

/** The Claude client, or `null` when ANTHROPIC_API_KEY is not configured. */
export function getAnthropic(): Anthropic | null {
  if (globalForAi.anthropic !== undefined) return globalForAi.anthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  globalForAi.anthropic = key ? new Anthropic({ apiKey: key }) : null;
  return globalForAi.anthropic;
}

/** True when AI features can run (a key is configured). UI can hide AI widgets when false. */
export function isAiEnabled(): boolean {
  return getAnthropic() !== null;
}

/** Model map — pick by task class, never hardcode an id in a feature. */
export const AI_MODELS = {
  default: "claude-sonnet-4-6", // support replies, NL→filters, listing drafts, pricing
  reasoning: "claude-opus-4-8", // hard reasoning: AI Dispute Judge
  fast: "claude-haiku-4-5", // cheap bulk: classification, search-log enrichment
} as const;

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];

const DEFAULT_MAX_TOKENS = 1024;

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Free-text generation. Returns the model's text, or `null` when AI is disabled
 * or the call fails. Never throws.
 */
export async function generateText(opts: {
  system?: string;
  prompt: string;
  model?: AiModel;
  maxTokens?: number;
}): Promise<string | null> {
  const client = getAnthropic();
  if (!client) return null;
  try {
    const message = await client.messages.create({
      model: opts.model ?? AI_MODELS.default,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: opts.prompt }],
    });
    return extractText(message);
  } catch (err) {
    captureException(err);
    return null;
  }
}

const JSON_INSTRUCTION =
  "Respond with ONLY a single valid JSON object that matches the requested shape — no markdown, no code fences, no commentary before or after.";

/** Pull the first {...} JSON object out of a model reply (tolerates stray fences/prose). */
function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return undefined;
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Structured generation: ask Claude for JSON and validate it against a Zod schema.
 * Retries once on a parse/validation miss. Returns the typed object, or `null` when
 * AI is disabled or every attempt fails. Never throws — callers degrade gracefully.
 */
export async function generateJSON<T>(opts: {
  schema: z.ZodType<T>;
  system?: string;
  prompt: string;
  model?: AiModel;
  maxTokens?: number;
  retries?: number;
}): Promise<T | null> {
  const client = getAnthropic();
  if (!client) return null;

  const system = `${opts.system ? `${opts.system}\n\n` : ""}${JSON_INSTRUCTION}`;
  const attempts = Math.max(1, (opts.retries ?? 1) + 1);

  for (let i = 0; i < attempts; i++) {
    try {
      const message = await client.messages.create({
        model: opts.model ?? AI_MODELS.default,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        system,
        messages: [{ role: "user", content: opts.prompt }],
      });
      const parsed = opts.schema.safeParse(extractJsonObject(extractText(message)));
      if (parsed.success) return parsed.data;
    } catch (err) {
      captureException(err);
    }
  }
  return null;
}

/** Model that answers buyer/seller support questions (Step 16 AI Support bot). */
export const SUPPORT_MODEL: AiModel = AI_MODELS.default;

export type SupportTurn = { role: "user" | "assistant"; content: string };

/**
 * Stream a support reply as plain text deltas (Step 16). Yields nothing when AI is
 * disabled — callers MUST gate on `isAiEnabled()` first (the route returns 503).
 *
 * Unlike generateText/generateJSON this DOES NOT swallow upstream errors: a mid-stream
 * Anthropic failure propagates so the route can flush an error SSE event and close.
 * `system` carries the GETX identity + server-injected order context; `messages` is the
 * sanitised running conversation. Never call inside a DB transaction.
 */
export async function* streamSupportResponse(
  messages: SupportTurn[],
  system: string,
  model: AiModel = SUPPORT_MODEL,
): AsyncGenerator<string, void, unknown> {
  const client = getAnthropic();
  if (!client) return;
  const stream = client.messages.stream({
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    system,
    messages,
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
