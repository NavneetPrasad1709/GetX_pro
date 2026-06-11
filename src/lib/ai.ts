import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { captureException } from "@sentry/nextjs";

/**
 * The unified GETX AI layer (Prompt 23) — ONE entry point every AI feature uses.
 *
 * Operating principles (do NOT violate):
 *   • AI is the DEFAULT interface; the human is the EXCEPTION path. AI suggests,
 *     rules/humans decide money — never write a ledger row or move escrow from here.
 *   • Env-safe degradation: with NO provider key the layer is dormant and every
 *     helper returns null/fallback — a feature degrades, it never crashes.
 *   • Helpers NEVER throw (except the support stream, which must surface errors to
 *     the route) and are called fire-and-forget, never inside a DB transaction.
 *
 * Provider preference (Step 23 deploy): Claude when `ANTHROPIC_API_KEY` is set
 * (best quality, model policy per CLAUDE.md §3), else a FREE Groq fallback when
 * `GROQ_API_KEY` is set (OpenAI-compatible Llama models via fetch, no extra SDK),
 * else dormant. Callers don't change — `AI_MODELS` stays semantic and is mapped
 * to a Groq model under the hood.
 */

const globalForAi = globalThis as unknown as { anthropic?: Anthropic | null };

/** The Claude client, or `null` when ANTHROPIC_API_KEY is not configured. */
export function getAnthropic(): Anthropic | null {
  if (globalForAi.anthropic !== undefined) return globalForAi.anthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  globalForAi.anthropic = key ? new Anthropic({ apiKey: key }) : null;
  return globalForAi.anthropic;
}

type Provider = "anthropic" | "groq";
/** Which LLM provider is active (Claude preferred, then free Groq, then none). */
function getProvider(): Provider | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  return null;
}

/** True when AI features can run (a provider key is configured). */
export function isAiEnabled(): boolean {
  return getProvider() !== null;
}

/** Model map — pick by task class, never hardcode an id in a feature. */
export const AI_MODELS = {
  default: "claude-sonnet-4-6", // support replies, NL→filters, listing drafts, pricing
  reasoning: "claude-opus-4-8", // hard reasoning: AI Dispute Judge
  fast: "claude-haiku-4-5", // cheap bulk: classification, search-log enrichment
} as const;

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];

const DEFAULT_MAX_TOKENS = 1024;

// --- Groq (free fallback) ---------------------------------------------------

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_LARGE = "llama-3.3-70b-versatile"; // default + reasoning
const GROQ_FAST = "llama-3.1-8b-instant"; // fast/bulk

/** Map a semantic Claude model to the Groq model used when running on Groq. */
function groqModelFor(model: AiModel): string {
  return process.env.GROQ_MODEL || (model === AI_MODELS.fast ? GROQ_FAST : GROQ_LARGE);
}

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

function groqBody(opts: {
  system?: string;
  messages: ChatMsg[];
  model: string;
  maxTokens: number;
  json?: boolean;
  stream?: boolean;
}) {
  return JSON.stringify({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...(opts.stream ? { stream: true } : {}),
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    messages: [
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      ...opts.messages,
    ],
  });
}

/** Non-streaming Groq completion. Throws on a non-OK response. */
async function groqComplete(opts: {
  system?: string;
  messages: ChatMsg[];
  model: string;
  maxTokens: number;
  json?: boolean;
}): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: groqBody(opts),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Streaming Groq completion — yields text deltas (OpenAI-compatible SSE). */
async function* groqStream(opts: {
  system?: string;
  messages: ChatMsg[];
  model: string;
  maxTokens: number;
}): AsyncGenerator<string, void, unknown> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: groqBody({ ...opts, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Groq HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the trailing partial line for the next chunk
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // keep-alive / non-JSON line — ignore
      }
    }
  }
}

// --- shared helpers ---------------------------------------------------------

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
  const provider = getProvider();
  if (!provider) return null;
  const model = opts.model ?? AI_MODELS.default;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  try {
    if (provider === "anthropic") {
      const message = await getAnthropic()!.messages.create({
        model,
        max_tokens: maxTokens,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: opts.prompt }],
      });
      return extractText(message);
    }
    return await groqComplete({
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      model: groqModelFor(model),
      maxTokens,
    });
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
 * Structured generation: ask the model for JSON and validate it against a Zod
 * schema. Retries once on a parse/validation miss. Returns the typed object, or
 * `null` when AI is disabled or every attempt fails. Never throws.
 */
export async function generateJSON<T>(opts: {
  schema: z.ZodType<T>;
  system?: string;
  prompt: string;
  model?: AiModel;
  maxTokens?: number;
  retries?: number;
}): Promise<T | null> {
  const provider = getProvider();
  if (!provider) return null;

  const model = opts.model ?? AI_MODELS.default;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const system = `${opts.system ? `${opts.system}\n\n` : ""}${JSON_INSTRUCTION}`;
  const attempts = Math.max(1, (opts.retries ?? 1) + 1);

  for (let i = 0; i < attempts; i++) {
    try {
      let text: string;
      if (provider === "anthropic") {
        const message = await getAnthropic()!.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: opts.prompt }],
        });
        text = extractText(message);
      } else {
        text = await groqComplete({
          system,
          messages: [{ role: "user", content: opts.prompt }],
          model: groqModelFor(model),
          maxTokens,
          json: true, // Groq/OpenAI JSON mode (the system prompt mentions "JSON")
        });
      }
      const parsed = opts.schema.safeParse(extractJsonObject(text));
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
 * Unlike generateText/generateJSON this DOES NOT swallow upstream errors: a
 * mid-stream failure propagates so the route can flush an error SSE and close.
 * `system` carries the GETX identity + server-injected order context; `messages`
 * is the sanitised running conversation. Never call inside a DB transaction.
 */
export async function* streamSupportResponse(
  messages: SupportTurn[],
  system: string,
  model: AiModel = SUPPORT_MODEL,
): AsyncGenerator<string, void, unknown> {
  const provider = getProvider();
  if (!provider) return;

  if (provider === "anthropic") {
    const stream = getAnthropic()!.messages.stream({
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
    return;
  }

  // Free Groq fallback.
  yield* groqStream({
    system,
    messages,
    model: groqModelFor(model),
    maxTokens: DEFAULT_MAX_TOKENS,
  });
}
