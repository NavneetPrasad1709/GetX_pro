# STEP 25 — AI Dispute Judge (Claude + pgvector)

> Goal: `claude-opus-4-8` reads the full dispute context (chat, delivery proof, order, reviews) and
> returns a structured verdict with confidence; past resolved cases are stored as pgvector embeddings
> for few-shot retrieval; high-confidence verdicts auto-resolve; admin confirms or overrides low-confidence ones.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend Engineer + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1 ledger, §4 pooling, §5 server-side money, §7 auth/rate-limit,
§8 observability). Work in `D:\GetX`. This is **Step 25 — AI Dispute Judge**. Talk Hinglish.
Follow the full workflow.

### Task

1. **Enable pgvector in Neon** (one-time DDL, idempotent):
   - In the migration SQL (task 2 below), add as the very first statement:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```
   - In `prisma/schema.prisma`, add the `postgresqlExtensions` preview feature:
     ```prisma
     generator client {
       provider        = "prisma-client-js"
       previewFeatures = ["postgresqlExtensions"]
     }

     datasource db {
       provider   = "postgresql"
       url        = env("DATABASE_URL")
       directUrl  = env("DIRECT_URL")
       extensions = [vector]
     }
     ```
   - Run `prisma generate` after schema change so the client picks up the extension. The extension
     install is safe to run against Neon on the `DIRECT_URL` connection (not the pooled one) — note
     this in `docs/DECISIONS.md`.

2. **DB migration** (`prisma/migrations/20260610000000_step25_dispute_judge/migration.sql`):
   Use the `prisma migrate diff --from-schema-datasource --to-schema-datamodel` → hand-write the
   SQL file → `prisma migrate deploy` workflow (never `prisma migrate dev` — it is interactive).
   After deploying, run `prisma generate`.

   New fields on the existing **`Dispute`** model:
   ```sql
   ALTER TABLE "Dispute"
     ADD COLUMN IF NOT EXISTS "aiVerdict"       TEXT,
     ADD COLUMN IF NOT EXISTS "aiConfidence"    INTEGER,
     ADD COLUMN IF NOT EXISTS "aiReasoning"     TEXT,
     ADD COLUMN IF NOT EXISTS "aiKeyFacts"      JSONB,
     ADD COLUMN IF NOT EXISTS "judgedAt"        TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS "judgeActorType"  TEXT NOT NULL DEFAULT 'HUMAN';
   ```
   `judgeActorType` values: `'HUMAN'` | `'AI'` (plain string, not a separate PG enum, to avoid a
   `CREATE TYPE` migration clash).

   New model **`DisputeEmbedding`** (stores resolved cases as vectors for few-shot retrieval):
   ```sql
   CREATE TABLE IF NOT EXISTS "DisputeEmbedding" (
     "id"         TEXT NOT NULL PRIMARY KEY,
     "disputeId"  TEXT NOT NULL UNIQUE,
     "verdict"    TEXT NOT NULL,
     "reasoning"  TEXT NOT NULL,
     "embedding"  vector(1536),
     "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT "DisputeEmbedding_disputeId_fkey"
       FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE
   );
   CREATE INDEX IF NOT EXISTS "DisputeEmbedding_embedding_idx"
     ON "DisputeEmbedding" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 50);
   ```

   Update `prisma/schema.prisma` with matching Prisma models:
   ```prisma
   model DisputeEmbedding {
     id         String   @id @default(cuid())
     disputeId  String   @unique
     dispute    Dispute  @relation(fields: [disputeId], references: [id], onDelete: Cascade)
     verdict    String
     reasoning  String
     embedding  Unsupported("vector(1536)")?
     createdAt  DateTime @default(now())
   }
   ```
   Add the reverse relation `disputeEmbedding DisputeEmbedding?` on the existing `Dispute` model.
   Add the new columns to the `Dispute` model in Prisma schema with their types
   (`aiVerdict String?`, `aiConfidence Int?`, `aiReasoning String?`, `aiKeyFacts Json?`,
   `judgedAt DateTime?`, `judgeActorType String @default("HUMAN")`).

3. **Embedding helper** (`src/lib/embeddings.ts`):
   - Export `embedText(text: string): Promise<number[]>`:
     - **If `OPENAI_API_KEY` is set** (owner has approved): call OpenAI
       `text-embedding-3-small` (1536 dimensions) via the `openai` npm package. Return the
       embedding vector. Install `openai` only if the key is present (check `package.json` first
       to avoid adding a dependency that is never used).
     - **If `OPENAI_API_KEY` is absent** (default / unapproved): use a
       **keyword-based fallback** — do NOT call any external API. Instead, implement
       `keywordVector(text): number[]` that:
       1. Tokenises `text` (lowercase, split on non-alphanumeric).
       2. Hashes each token into a bucket index in a fixed 1536-dim space using
          `(djb2Hash(token) % 1536 + 1536) % 1536`.
       3. Increments the bucket; normalises the result to unit length.
       This produces a deterministic sparse vector that enables approximate cosine retrieval
       even without an embedding model. It is less accurate than OpenAI but never fails.
     - Either path returns `number[]` of length exactly 1536. The function must never throw —
       on any error return a zero vector of length 1536 and capture the exception with
       `Sentry.captureException`.
   - Export `EMBEDDING_DIM = 1536` constant (referenced by the service and migration).
   - Add `OPENAI_API_KEY=` to `.env.example` with a comment: `# Optional: enables real embeddings for AI Dispute Judge`.

4. **Dispute Judge service** (`src/server/services/dispute-judge.ts`):

   4a. **`findSimilarCases(queryText: string, topK = 3): Promise<SimilarCase[]>`**
   - Call `embedText(queryText)` to get the query vector.
   - Execute a raw Prisma query using pgvector cosine distance operator `<=>`:
     ```typescript
     const rows = await db.$queryRaw<RawRow[]>`
       SELECT de."disputeId", de."verdict", de."reasoning",
              1 - (de."embedding" <=> ${vector}::vector) AS similarity
       FROM   "DisputeEmbedding" de
       WHERE  de."embedding" IS NOT NULL
       ORDER  BY de."embedding" <=> ${vector}::vector
       LIMIT  ${topK}
     `;
     ```
     Where `vector` is the embedding formatted as a Postgres literal string
     `'[0.1, 0.2, ...]'` (join the number array with commas, wrap in brackets, cast to `::vector`).
   - Return `SimilarCase[]` typed as `{ disputeId: string; verdict: string; reasoning: string; similarity: number }[]`.
   - If there are fewer than `topK` rows in `DisputeEmbedding` (cold start), return whatever is
     available — do not error.

   4b. **`judgeDispute(disputeId: string): Promise<JudgeResult>`**
   Full pipeline — load context → retrieve similar cases → call Claude → persist verdict.

   **Context loading** (all via Prisma singleton `src/lib/db.ts`):
   ```
   Dispute + Order (with priceMinor, sellerFeeMinor, buyerFeeMinor, status, createdAt, completedAt)
     + Listing (title, description, priceMinor, deliveryType)
     + Buyer (id, email, SellerProfile.trustScore)
     + Seller (id, email, SellerProfile.trustScore, ratingAvg, ratingCount, totalSales, kycStatus)
     + OrderDelivery (deliveryNote, proofUrls, createdAt)
     + Messages in the Conversation linked to this order (body, senderId, createdAt, last 30 msgs max)
     + Reviews linked to the buyer↔seller pair (ratingScore, comment, createdAt, last 5 reviews)
     + Dispute itself (reason, description, openedAt, status, openedBy)
   ```
   Serialise everything into a `contextString` (compact JSON-like plain text, < 8000 tokens).

   **Similar cases** — call `findSimilarCases(contextString.slice(0, 500), 3)`. Format into a
   `similarCasesBlock` string like:
   ```
   PAST CASE 1 (similarity 0.91, verdict SELLER): <reasoning>
   PAST CASE 2 (similarity 0.87, verdict BUYER): <reasoning>
   ```
   If no past cases yet, set `similarCasesBlock = "No past cases available yet."`.

   **System prompt** (defined inline as a template literal, NOT in a separate file):
   ```
   You are the GETX AI Dispute Judge — an impartial arbitrator for a gaming marketplace escrow system.

   GETX DISPUTE POLICY:
   - Escrow funds are held until the buyer confirms receipt or the auto-release timer expires.
   - Seller must deliver within the agreed window. Proof of delivery (screenshots, delivery note) is
     required. Buyer has 48 hours to dispute after delivery is marked.
   - Verdict SELLER = release escrow to seller (seller wins). Verdict BUYER = refund buyer (buyer wins).
   - Base your verdict on: delivery proof quality, communication tone, order timeline, seller reputation,
     and GETX policy. If evidence is genuinely ambiguous, lower your confidence below 70.

   FEES (do NOT penalise the dispute winner for fees — fees are sunk cost):
   - Buyer pays a 5% platform fee at checkout (non-refundable only on SELLER verdict).
   - Seller commission is deducted at payout (already accounted for in escrow).

   SIMILAR PAST CASES:
   <similarCasesBlock>

   Reply with ONLY valid JSON — no prose, no markdown, no code fences:
   {
     "verdict": "BUYER" | "SELLER",
     "confidence": <integer 0–100>,
     "reasoning": "<2–4 sentences explaining the decision>",
     "keyFacts": ["<fact1>", "<fact2>", ...]
   }
   ```

   **Claude call** — use model `claude-opus-4-8` (hard reasoning, not Sonnet). Use the Anthropic
   SDK client from `src/lib/ai.ts`. Single `messages.create` call (non-streaming). Max tokens: 512.
   Temperature: 0 (deterministic). Parse the response text with `JSON.parse`; validate with Zod:
   ```typescript
   const JudgeOutputSchema = z.object({
     verdict:    z.enum(["BUYER", "SELLER"]),
     confidence: z.number().int().min(0).max(100),
     reasoning:  z.string().min(1),
     keyFacts:   z.array(z.string()),
   });
   ```
   If parsing fails (malformed JSON or schema mismatch), log to Sentry, set
   `confidence = 0`, `verdict = "BUYER"` (safe default — refund), `reasoning = "AI parsing failed — manual review required."`,
   and continue (do not throw).

   **Auto-resolve vs human review gate** (inside a `prisma.$transaction`):
   - Persist AI fields to `Dispute` regardless of confidence:
     `aiVerdict`, `aiConfidence`, `aiReasoning`, `aiKeyFacts` (JSON), `judgedAt = now()`.
   - **If `confidence >= 70`**: set `judgeActorType = "AI"` and call the existing
     `resolveDispute(disputeId, verdict === "BUYER" ? "REFUND" : "RELEASE", "AI_JUDGE")` from
     `src/server/services/escrow.ts`. This moves money via the append-only ledger in the same
     transaction — reuse the existing service, do not duplicate ledger logic.
   - **If `confidence < 70`**: set `judgeActorType = "HUMAN"`, leave the `Dispute.status` as
     `OPEN`, do NOT touch the ledger. The admin queue picks it up as a pending AI-suggested verdict.
   - After the transaction, **if confidence >= 70**: call `storeDisputeEmbedding(disputeId, verdict, reasoning)`
     (outside the transaction — best-effort, non-blocking).

   4c. **`storeDisputeEmbedding(disputeId, verdict, reasoning)`**:
   - `embedText(verdict + ' ' + reasoning)` → upsert into `DisputeEmbedding` (create if not exists,
     skip if the row already exists — use Prisma `upsert` with `update: {}`).
   - Wrap entirely in try/catch. On error: `Sentry.captureException`, return `undefined` silently.

   4d. **Return type** `JudgeResult`:
   ```typescript
   type JudgeResult = {
     verdict: "BUYER" | "SELLER";
     confidence: number;
     reasoning: string;
     keyFacts: string[];
     autoResolved: boolean;   // true if confidence >= 70 and resolveDispute was called
     requiresHumanReview: boolean;  // true if confidence < 70
   };
   ```

   4e. **Guard rails**:
   - If the Dispute is already `RESOLVED`, `CLOSED`, or `COMPLETED`, return early without calling
     Claude (idempotent — log a warning).
   - If `ANTHROPIC_API_KEY` is absent, throw a descriptive error (caught by the enqueue wrapper).
   - The entire function is wrapped in try/catch; on unexpected error, `Sentry.captureException`
     and rethrow so the caller can surface it to the admin.

5. **Background enqueue on dispute creation** (`src/server/actions/disputes.ts` or wherever
   `Dispute` rows are created — check the real file path before editing):
   - After a new `Dispute` row is committed, fire-and-forget:
     ```typescript
     setTimeout(() => {
       judgeDispute(dispute.id).catch(err =>
         console.error('[dispute-judge] background job failed', err)
       );
     }, 0);
     ```
   - This is a temporary `setTimeout(0)` wrapper (a proper job queue — e.g. Vercel Cron or
     BullMQ — is out of scope for this step; log a `TODO: replace with durable queue` comment).
   - Do NOT `await` this call on the request path — dispute creation must remain fast.

6. **Admin dispute queue enhancements** (`src/app/admin/disputes/` — extend the existing page):
   - **AI verdict badge**: next to each open dispute, show the `aiVerdict` + `aiConfidence` (if
     populated) as a styled badge: green for SELLER verdict, amber for BUYER verdict, grey if not
     judged yet. If `confidence < 70`, add a "Needs Review" amber pill.
   - **Detail page** (`src/app/admin/disputes/[id]/page.tsx`): add an "AI Analysis" card showing:
     - Verdict suggestion (`BUYER` / `SELLER`), confidence bar (0–100), reasoning paragraph,
       key facts list.
     - If `judgeActorType === "AI"` and already auto-resolved: show a "Auto-resolved by AI" banner
       with the verdict and confidence — admin can still override.
   - **Accept (1-click)** Server Action `acceptAiVerdict(disputeId)`:
     - Admin role check. Dispute must be `OPEN` with `aiVerdict` populated.
     - Calls `resolveDispute(...)` with the stored `aiVerdict`, sets `judgeActorType = "HUMAN"`
       (admin accepted it), writes `AuditLog` (`ACCEPT_AI_VERDICT`, targetId = disputeId).
   - **Override** Server Action `overrideAiVerdict(disputeId, overrideVerdict, overrideReason)`:
     - Admin role check. Dispute must be `OPEN` or already auto-resolved (can undo AI).
     - Calls `resolveDispute(...)` with `overrideVerdict`, stores `overrideReason` in `aiReasoning`
       (append " [ADMIN OVERRIDE: <reason>]"), sets `judgeActorType = "HUMAN"`.
     - Stores the override as a new `DisputeEmbedding` (human-corrected cases are high-quality
       training data for future few-shot retrieval).
     - Writes `AuditLog` (`OVERRIDE_AI_VERDICT`, targetId = disputeId, detail = overrideReason).
   - All mutations use Server Actions (`"use server"`), re-validate admin role + dispute ownership.

7. **Edge cases**:
   - pgvector extension not yet installed → `CREATE EXTENSION IF NOT EXISTS vector` is idempotent;
     if Neon plan does not support it, the migration fails loudly — do not silently continue.
   - `DisputeEmbedding` table empty (cold start / first dispute ever) → `findSimilarCases` returns
     `[]`; `judgeDispute` continues with `"No past cases available yet."` in the prompt — tested.
   - OpenAI API timeout or 5xx → `embedText` catches, returns zero vector, Sentry captures; judge
     proceeds with degraded but functional keyword vectors.
   - Claude returns non-JSON or truncated output (max_tokens hit) → Zod parse fails → safe default
     (confidence 0, BUYER, "parsing failed") → human review path; Sentry capture.
   - Dispute already resolved when background job fires → `judgeDispute` returns early; no
     double-resolution, no double ledger entry.
   - `resolveDispute` throws (e.g. ledger insert conflict) → transaction rolls back; Sentry capture;
     `judgeActorType` stays `HUMAN`; admin queue shows the un-resolved dispute.
   - Admin calls `acceptAiVerdict` on a dispute that was already auto-resolved by the AI → idempotent
     (already resolved, return 200 with a "already resolved" message, no duplicate AuditLog).
   - Admin calls `overrideAiVerdict` with the same verdict as AI (confirming, not truly overriding) →
     valid; still writes AuditLog; still stores embedding.

8. **QA harness** (`scripts/qa-step25.ts`):
   Run with `npx tsx scripts/qa-step25.ts`. Follow repo convention: `ok(label, condition)` /
   `threw(label, fn)` helpers, real Prisma against dev DB, all seeded rows cleaned up in `finally`.
   Test cases:
   - **a. pgvector extension enabled**: `SELECT 1 FROM pg_extension WHERE extname = 'vector'` via
     `db.$queryRaw` → returns a row.
   - **b. `embedText` returns 1536-dim vector**: call `embedText("test dispute text")` → array length
     equals 1536; all values are finite numbers.
   - **c. Valid Claude JSON output**: create a minimal seeded Dispute (with linked Order, Listing,
     Buyer, Seller, OrderDelivery) → call `judgeDispute(disputeId)` → response is valid `JudgeResult`
     with `verdict` in `["BUYER","SELLER"]`, `confidence` in `[0,100]`, non-empty `reasoning`,
     `keyFacts` is an array. `Dispute.aiVerdict` is populated in the DB.
   - **d. Low confidence → human review**: mock Claude to return `confidence: 60` (stub the
     `messages.create` call) → `autoResolved === false`, `requiresHumanReview === true`, `Dispute.status`
     remains `OPEN`, ledger is unchanged (no new `LedgerEntry` rows for this dispute).
   - **e. High confidence → auto-resolve + correct ledger**: mock Claude to return `confidence: 85`,
     `verdict: "SELLER"` → `autoResolved === true`, `Dispute.status === "RESOLVED"` (or whatever
     `resolveDispute` sets), at least one new `LedgerEntry` row exists with the released amount,
     wallet balances reflect the release.
   - **f. Embedding stored after auto-resolve**: after test (e), query `DisputeEmbedding` for this
     `disputeId` → row exists with non-null `embedding`.
   - **g. Similar-case retrieval**: after test (f), call `findSimilarCases("seller dispute delivery proof", 3)`
     → returns array; similarity values are between 0 and 1.
   - **h. Idempotency — already resolved dispute**: call `judgeDispute` again on the same (now
     resolved) dispute → returns early without error, `Dispute.aiConfidence` unchanged.
   - **i. Admin acceptAiVerdict**: create a new seeded dispute, run `judgeDispute` with mocked low
     confidence (dispute stays OPEN), then call `acceptAiVerdict` as admin → dispute resolved,
     AuditLog row with action `ACCEPT_AI_VERDICT` exists.
   - **j. Admin overrideAiVerdict**: create a new seeded dispute, run `judgeDispute` with mocked high
     confidence (auto-resolved as SELLER), then call `overrideAiVerdict` with `BUYER` + reason →
     dispute now resolved as BUYER, AuditLog row with `OVERRIDE_AI_VERDICT` exists, a new
     `DisputeEmbedding` row exists for this dispute with the corrected verdict.
   - **k. No API key → judgeDispute throws cleanly**: temporarily unset `ANTHROPIC_API_KEY` →
     `judgeDispute` throws a descriptive error (does not silently return garbage).
   - Print summary: `X/X tests passed`.

### Rules

- **`claude-opus-4-8` is the judge model** — do not downgrade to Sonnet or Haiku for cost savings.
  Dispute verdicts affect real money. Log model used in every `AuditLog` entry for traceability.
- **Money moves only via `resolveDispute`** from `src/server/services/escrow.ts` — never write
  `LedgerEntry` rows directly in the judge service. The escrow service is the single source of truth
  for all balance mutations; this prevents double-entry and maintains the append-only ledger invariant.
- **Embeddings are best-effort** — `storeDisputeEmbedding` and `findSimilarCases` must never throw
  to the caller. A failure in vector storage cannot block a dispute resolution. Wrap everything in
  try/catch and capture to Sentry.
- **OpenAI embeddings are opt-in** — if `OPENAI_API_KEY` is absent the system must work correctly
  with the keyword-vector fallback. Never make the feature dependent on a key that is not guaranteed
  to exist.

### Report back

CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST

- [ ] pgvector extension enabled in Neon: `SELECT 1 FROM pg_extension WHERE extname = 'vector'` returns a row
- [ ] Migration applied cleanly: `DisputeEmbedding` table exists; new columns on `Dispute` visible in Prisma Studio
- [ ] `prisma generate` succeeds with `postgresqlExtensions` preview feature; `Unsupported("vector(1536)")` field accepted
- [ ] `embedText` returns a number[] of exactly 1536 values (both OpenAI and keyword-fallback paths tested)
- [ ] `judgeDispute` returns valid `JudgeResult` with all required fields populated and persisted to `Dispute` row
- [ ] Low confidence (<70): dispute stays `OPEN`, no `LedgerEntry` created, `requiresHumanReview === true`
- [ ] High confidence (≥70): dispute auto-resolved via `resolveDispute`, correct `LedgerEntry` rows created, wallet balances updated
- [ ] `DisputeEmbedding` row created after auto-resolve; `embedding` field is non-null
- [ ] `findSimilarCases` returns results with similarity scores between 0 and 1
- [ ] Cold start (empty `DisputeEmbedding` table): `judgeDispute` completes without error, similar-cases block reads "No past cases available yet."
- [ ] Already-resolved dispute: second call to `judgeDispute` returns early; no duplicate resolution, no extra `LedgerEntry`
- [ ] Admin dispute queue shows AI verdict badge + confidence for judged disputes; "Needs Review" pill on low-confidence
- [ ] Admin detail page: "AI Analysis" card shows verdict, confidence bar, reasoning, key facts
- [ ] `acceptAiVerdict` Server Action: dispute resolved, `AuditLog` row `ACCEPT_AI_VERDICT` written, admin role enforced
- [ ] `overrideAiVerdict` Server Action: dispute resolved with override verdict, `AuditLog` row `OVERRIDE_AI_VERDICT` written, new `DisputeEmbedding` stored with corrected verdict
- [ ] Non-admin calling `acceptAiVerdict` or `overrideAiVerdict` is rejected (auth error)
- [ ] `ANTHROPIC_API_KEY` absent → `judgeDispute` throws descriptive error; background enqueue catches and logs it without crashing the dispute creation request
- [ ] Absent `OPENAI_API_KEY` → keyword-vector fallback used; `embedText` returns 1536-dim vector; no crash
- [ ] Background `setTimeout(0)` enqueue: dispute creation endpoint returns quickly; judge runs asynchronously (verified via log timestamps)
- [ ] Sentry captures exceptions from embedding failures and Claude parse errors (check Sentry dashboard or mock Sentry in QA)
- [ ] `scripts/qa-step25.ts` passes all 11 test cases (a–k); prints summary `11/11 tests passed`
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive admin dispute detail page
- [ ] Step 25 ticked in `docs/ROADMAP.md`; pgvector decision + OpenAI opt-in rationale logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step

Step 26 — **AI Demand Forecast + Dynamic Pricing**: use historical order data + listing views to
predict demand per category/game and suggest optimal listing prices to sellers via a weekly
background job (`claude-sonnet-4-6` for analysis, Vercel Cron for scheduling).

## 🔑 Tokens needed: **`ANTHROPIC_API_KEY`** (already in `.env` from Step 16); optional **`OPENAI_API_KEY`** for real embeddings (keyword fallback works without it).
