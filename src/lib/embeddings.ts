import { captureException } from "@sentry/nextjs";

/**
 * Text → 1536-dim vector for the AI Dispute Judge's case memory (Step 25).
 *
 * ENV-SAFE / OPT-IN: real semantic embeddings need OPENAI_API_KEY (deferred to
 * launch). Without it, `embedText` uses a deterministic KEYWORD vector — a
 * hashed bag-of-words in the same 1536-dim space — so approximate cosine
 * retrieval still works (lexical, less accurate than a model, but never fails
 * and needs no external call or npm dependency). When a key IS set we call the
 * OpenAI embeddings REST API directly via fetch (no SDK package added).
 *
 * `embedText` NEVER throws: on any error it captures to Sentry and degrades to
 * the keyword vector; truly empty input yields a zero vector.
 */

export const EMBEDDING_DIM = 1536;

/** djb2 string hash → unsigned 32-bit. Deterministic across runs/processes. */
function djb2Hash(token: string): number {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 33) ^ token.charCodeAt(i);
  }
  return hash >>> 0; // force unsigned
}

/**
 * Deterministic sparse term vector: tokenise, hash each token into a 1536-dim
 * bucket, count, then L2-normalise to unit length (so cosine == dot product).
 * Empty / token-less input returns the zero vector.
 */
export function keywordVector(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const t of tokens) {
    const bucket = ((djb2Hash(t) % EMBEDDING_DIM) + EMBEDDING_DIM) % EMBEDDING_DIM;
    vec[bucket] += 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec; // no tokens → zero vector
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

/** Call OpenAI's embeddings REST API (no SDK). Throws on any non-OK / bad shape. */
async function openAiEmbed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings HTTP ${res.status}`);
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = json.data?.[0]?.embedding;
  if (
    !Array.isArray(embedding) ||
    embedding.length !== EMBEDDING_DIM ||
    !embedding.every((x) => typeof x === "number" && Number.isFinite(x))
  ) {
    // A malformed/non-numeric response would otherwise produce invalid ::vector SQL.
    throw new Error("OpenAI embeddings: unexpected response shape");
  }
  return embedding;
}

/**
 * Embed `text` to exactly EMBEDDING_DIM numbers. OpenAI when configured, else the
 * keyword vector. Never throws.
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return keywordVector(text);
  try {
    return await openAiEmbed(text, apiKey);
  } catch (err) {
    // Degrade to the keyword vector rather than failing a dispute resolution.
    captureException(err);
    return keywordVector(text);
  }
}
