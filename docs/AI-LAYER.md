# The GETX AI Layer — the AI-Native Moat

> Architecture for GETX's genuine, defensible differentiator (Audit Prompt 23). One coherent AI
> layer — a single `src/lib/ai.ts` client + a funnel-wide feature map + the operating principle —
> so GETX is the **first truly AI-native gaming marketplace**, not a forms marketplace with a
> chatbot bolted on. Built on the existing Next.js 16 + Prisma + Neon + Claude stack.

---

## The operating principle (non-negotiable)

Eldorado/G2G/ZeusX/PlayerAuctions are **manual-form marketplaces**: a seller fills a blank listing
form, a buyer types keywords into a box, an admin reads a dispute thread by hand. They bolt a
help-desk chatbot on the edge and call it "AI." GETX makes AI the **default interface across the
whole funnel**, with the human as the **exception path** (confirm / override / escalate). That is a
different product category — and the thing incumbents structurally cannot copy without rebuilding.

Three hard rules every AI feature obeys:

1. **AI suggests, rules/humans decide money.** AI never writes a `LedgerEntry`, never moves escrow.
   The Dispute Judge only ever calls the existing `resolveDispute(adminUserId, orderId, outcome,
   note)` in `escrow.ts`; AI listing output is persisted only through the validated `createListing`
   path; AI pricing is advisory until the seller clicks Save. The money/trust spine is untouched.
2. **Env-safe degradation.** With no `ANTHROPIC_API_KEY`, `getAnthropic()` returns `null` and every
   helper returns `null`/fallback. Features hide or fall back — nothing crashes. (Same pattern as
   Resend in Step 22.)
3. **Non-critical AI is fire-and-forget, never inside a DB transaction.** Fraud scoring, search-log
   enrichment, demand signals — `void aiThing().catch(captureException)` post-commit, like the
   notification + referral hooks.

---

## The layer: `src/lib/ai.ts` (BUILT)

One client, three helpers, one model map — every future AI feature imports these instead of
re-instantiating Anthropic and re-writing its own JSON parsing (the scattering this fixes):

- `getAnthropic(): Anthropic | null` — lazy null-safe singleton (null when unkeyed).
- `isAiEnabled(): boolean` — UI gates AI widgets on this.
- `generateText({ system, prompt, model?, maxTokens? }): Promise<string|null>` — free text.
- `generateJSON<T>({ schema, system, prompt, model?, retries? }): Promise<T|null>` — Claude → extract
  JSON → Zod-validate, one retry, typed result or null. Never throws.
- `AI_MODELS` (CLAUDE.md §3): `default` = `claude-sonnet-4-6` (everyday), `reasoning` =
  `claude-opus-4-8` (Dispute Judge), `fast` = `claude-haiku-4-5` (bulk/classification).

Every helper is **never-throw** and degrades to `null` — so an AI outage can never take down a page
or a money path.

---

## The funnel-wide feature map (what plugs into the layer)

Each row is a separate build (its own roadmap step) that consumes `ai.ts`. The blank form / keyword
box / manual review disappears; the human becomes the exception.

| Funnel stage | AI feature | Step | Model | Pattern | Money-safety |
|---|---|---|---|---|---|
| **Sell** | Listing drafter — seller pastes a screenshot/notes → AI drafts title + description + attributes + price band | 26 | `default` | `generateJSON` → pre-fills the form; seller edits + submits via `createListing` | AI output never persisted directly |
| **Browse** | Buyer concierge — plain-English query ("cheap L40 PoGo with shinies") → structured `MarketplaceFilters` | 28-adjacent | `fast` | `generateJSON(schema = MarketplaceFilters)` → existing `searchListings` | No new query path; advisory |
| **Trust** | Trust-score explainer — renders the computed trust score in human language | 17 (built) | `fast` | `generateText` over the existing breakdown | Read-only |
| **Support** | AI Support 24/7 — deflects the #1 ops complaint (latency); escalates to human on low confidence | 16 | `default` | `generateText`/`generateJSON`; 503 + widget hides when disabled | Suggest-only; human escalation |
| **Dispute** | **AI Dispute Judge** — reads chat + delivery proof → fair verdict in minutes | 25 | `reasoning` (Opus) | `generateJSON(verdict)` → admin reviews → `resolveDispute` | NEVER moves escrow itself |
| **Fraud** | Fraud Radar scorer — behavioural anomaly scoring on top of the Prompt-16 graph | 18 | `fast` | fire-and-forget `generateJSON`; AI flags, admins ban/remove | Flag-only |
| **Price** | AI pricing/demand — advisory price + "demand peaking" signal on the seller dashboard | 26 | `default` | `generateJSON`; seller must click Save | Advisory |

**pgvector memory** (Step 25): a `DisputeEmbedding` model + cosine `<=>` over past resolved disputes
gives the Dispute Judge case memory — the hard-to-copy moat layer. Not yet in the schema; add when
Step 25 ships.

---

## Why this is the moat

Incumbents have **none** of these and run on legacy infrastructure — adding an AI-native funnel is a
12-month rebuild for them. GETX ships each feature in weeks on a clean Claude-ready stack. The
Dispute Judge alone is a direct conversion driver: a buyer nervous about getting scammed chooses the
platform that resolves disputes in **minutes**, not 2–5 days. See `WHY-GETX-WINS.md` → Layer 2 (AI
capability moat) — this layer is how that moat gets built.

---

## Status & next

- ✅ **Built:** `src/lib/ai.ts` (client + `generateText`/`generateJSON` + `AI_MODELS` + `isAiEnabled`),
  `ANTHROPIC_API_KEY` in `.env(.example)`, graceful degradation verified (qa-ai.ts).
- ⏳ **To go live:** owner adds `ANTHROPIC_API_KEY`. Until then every AI feature returns null/fallback.
- ⏳ **Next builds (each consumes this layer):** Step 25 AI Dispute Judge (highest-value moat, Opus +
  pgvector) → Step 16 AI Support → Step 26 listing drafter + pricing + buyer concierge → Step 18 AI
  fraud scoring.
