# Scale Audit — What Breaks FIRST at 100k / 500k / 1M

> Code-grounded scale audit (Audit Prompt 25). **Analysis + decision only — no money/escrow/auth
> refactor here.** For each tier: the FIRST thing that breaks, the exact file/pattern, the fix, and
> the trigger metric to watch. Then a phased roadmap. Current as of 2026-06-10.
>
> The point is NOT to build any of this now (over-engineering pre-scale burns runway). It's to know
> *before* the growth curve hits exactly **which line of which file fails first**, what metric warns
> us, and what the fix costs — turning "the site got slow" panic into a pre-agreed sequence.

---

## The stack today (the constraints everything below follows from)

- **App:** Next.js 16 RSC on **Vercel serverless** — every request is a lambda, **no shared memory** between instances.
- **DB:** **Neon Postgres** via the **pooled** `DATABASE_URL` (pgbouncer); one Prisma client per lambda (`src/lib/db.ts`). Neon's pooler caps total connections.
- **Realtime:** **one** Socket.io process on Railway (`socket-server/src/server.ts`) — room membership + per-socket rate buckets live **in process memory**.
- **Rate limiting:** in-memory `Map` per lambda (`src/lib/rate-limit.ts`, line 14) — the file's own comment: *"each warm lambda has its own map, so the real-world limit is a multiple of `limit`."*
- **Search:** Postgres **ILIKE** `contains` on `title`+`description` (`marketplace.ts:39-40`, raw `ILIKE` at `:127`) — no trigram/GIN index.
- **Pagination:** offset (`skip`/`take`) + a parallel `db.listing.count` (`marketplace.ts:178`).
- **Scheduled work:** Vercel Cron `*/15` → single-sweep `runAutoRelease`, `AUTO_RELEASE_BATCH = 200` orders/run (`escrow.ts`).
- **Side effects:** no durable queue — notifications / referral / ops-tickets ride fire-and-forget `void fn().catch()` **inside the request**, lost on lambda freeze/crash.
- **Money:** append-only `LedgerEntry`; balances **derived by `groupBy` over the whole wallet ledger every read** (`wallet.ts:37`); concurrency = `SELECT … FOR UPDATE` + status CAS; the platform's revenue is a **single row** `PLATFORM_WALLET_ID = "platform"`.

---

## Tier 1 — ≈100k users: SEARCH breaks first

**#1 — Postgres ILIKE search (the first wall).**
- **Symptom:** marketplace + header search P95 climbs from ~50 ms to seconds as `Listing` grows; CPU on Neon spikes on every keystroke-driven query.
- **Bottleneck:** `marketplace.ts buildWhere` → `title ILIKE %q% OR description ILIKE %q%`. A leading-`%` `ILIKE` **cannot use a btree index** → sequential scan of every ACTIVE listing per search.
- **Fix (cheap interim → real):** add a `pg_trgm` GIN index on `title`/`description` (buys 5–10×, one migration) → then **Algolia** (Step 28) for typo-tolerance + facets + sub-50 ms. Keep Postgres as the source of truth; sync on listing write.
- **Trigger metric:** search query P95 > 300 ms, or Neon CPU > 60% with search dominating `pg_stat_statements`.

**#2 — Offset pagination + live `count`.**
- **Symptom:** deep result pages (`?page=200`) slow; the `count` half of the parallel query (`marketplace.ts:178`) gets expensive on large filtered sets.
- **Bottleneck:** `skip`/`take` scans-and-discards `skip` rows; `count(*)` over a filtered set is O(matches).
- **Fix:** keyset/cursor pagination (`WHERE (sort_key) < cursor`, already the pattern in reviews/chat) for "load more"; replace exact counts with capped/approximate counts (`reltuples` or "1,000+").
- **Trigger metric:** P95 of page > 5 rising; `count` query time in the slow log.

**#3 — In-memory rate limit is already a hole.**
- **Symptom:** auth/checkout abuse isn't actually throttled at the configured number — `N` warm lambdas ⇒ effective limit ≈ `N × limit`.
- **Bottleneck:** `src/lib/rate-limit.ts` `Map` is per-instance (line 7 comment admits it). Same in `socket-server/src/rate-limit.ts`.
- **Fix:** **Upstash Redis** sliding-window limiter (Step 32), shared across all lambdas + the socket process. Also unlocks WAF/bot rules.
- **Trigger metric:** observed abuse rate > configured limit; or simply: traffic high enough that > 1 warm instance is common (it already is on Vercel).

---

## Tier 2 — ≈500k users: MONEY-READ + DELIVERY + REALTIME strain

**#4 — Wallet balance derived by full-ledger `groupBy` every read.**
- **Symptom:** seller wallet/dashboard reads slow as a seller's `LedgerEntry` count reaches thousands; payout requests (which read balances under a `FOR UPDATE` lock) hold locks longer → contention.
- **Bottleneck:** `wallet.ts getWalletBalances` does `ledgerEntry.groupBy` over the wallet's **entire** history on every call (`:37`). O(ledger rows per wallet), and it runs inside the payout lock (`payouts.ts`).
- **Fix:** the schema already has `Wallet.cachedBalanceMinor` (currently a cache, not the source). Promote a **running-balance materialization**: maintain `cachedBalanceMinor` authoritatively on each append (it already snapshots `balanceAfterMinor` per row), and read the cache + only the rows since a checkpoint. Or a per-wallet rollup row. Keep the append-only ledger as truth + a periodic reconciliation job.
- **Trigger metric:** P95 of `getWalletBalances` > 100 ms; max `LedgerEntry` rows per wallet > ~5,000; payout-lock wait time rising.

**#5 — Auto-release single sweep caps throughput at 800 orders/hr.**
- **Symptom:** DELIVERED orders past their 3-day deadline release late; escrow backlog grows; sellers complain funds are "stuck."
- **Bottleneck:** `runAutoRelease` releases ≤ `AUTO_RELEASE_BATCH = 200`/run, cron `*/15` ⇒ **800 orders/hr** ceiling. Above that, backlog is unbounded. (`maxDuration = 60` also bounds a single run.)
- **Fix:** raise batch + cron frequency (needs Vercel Pro for < 15 min), OR move releases to a **durable queue** (one job per due order, parallel workers) so throughput scales with workers not a single sweep. CAS idempotency already makes this safe.
- **Trigger metric:** count of `Order status=DELIVERED AND autoReleaseAt < now()` (backlog depth) trending up between sweeps.

**#6 — Socket.io single process: vertical ceiling + no failover.**
- **Symptom:** concurrent chat connections plateau at one Railway box's memory/FD limit; a crash/redeploy drops **everyone** (rooms + rate buckets are in-process).
- **Bottleneck:** `socket-server/src/server.ts` holds all `user:`/`conversation:` room state + limiter buckets in memory; no Redis adapter, single instance.
- **Fix:** Socket.io **Redis adapter** (Upstash) for cross-instance room fan-out + horizontal scaling behind a sticky LB; move rate buckets to Redis. Notifications already push via `POST /notify` — that fan-out must hit all instances (Redis adapter solves it).
- **Trigger metric:** concurrent socket connections > ~10k or process memory > 70%; reconnect storms on deploy.

**#7 — Fire-and-forget side effects are lossy at volume.**
- **Symptom:** some notifications / referral awards / ops-tickets silently don't happen — lost when a lambda freezes/crashes mid `void fn().catch()`.
- **Bottleneck:** no durable queue; every post-commit side effect rides the request lambda (notifications, referral `checkAndAwardReferralBonus`, `ticketForDispute/Kyc`, fraud signals).
- **Fix:** a **durable queue** (Upstash QStash, or BullMQ on the Railway worker) for at-least-once side effects; keep the synchronous money tx, enqueue the side effect. CAS/idempotency in the consumers already makes retries safe.
- **Trigger metric:** notification/referral delivery-rate < ~99%; Sentry "lost side effect" patterns; lambda freeze logs.

---

## Tier 3 — ≈1M users: CONTENTION + TABLE GROWTH + LIVE ANALYTICS

**#8 — Platform-wallet single-row contention (the money hotspot).**
- **Symptom:** COMPLETED-order throughput plateaus; lock waits on the `"platform"` wallet row during peak; checkout→release latency spikes.
- **Bottleneck:** every COMPLETED order writes 2 FEE `LedgerEntry` rows to the **single** `PLATFORM_WALLET_ID="platform"` row and updates its cached balance — a global write hotspot serialized by the row lock (`escrow.ts`, `apply-event.ts`).
- **Fix:** stop maintaining a cached balance on the platform row in the hot path (derive platform revenue from FEE entries on demand / via rollup — it's read by analytics, not a payout path); or **shard** the platform wallet (e.g. `platform:<shard>`) and sum across shards. FEE entries are append-only, so this is contention-only, not correctness.
- **Trigger metric:** lock-wait time on the platform wallet row; COMPLETED-order P95 rising under concurrency.

**#9 — Unbounded append tables (`LedgerEntry`, `Message`, `AuditLog`, `Notification`, `Payment`).**
- **Symptom:** vacuum/bloat; index sizes balloon; query plans degrade; storage cost climbs.
- **Bottleneck:** these grow monotonically with GMV/activity and are never archived/partitioned.
- **Fix:** **time-based partitioning** (monthly) on the largest append tables + archival of cold partitions to cheap storage; a **read replica** for analytics/admin so reporting never touches the write primary. `AuditLog`/`Notification` can move to a retention window.
- **Trigger metric:** table > ~50–100M rows; autovacuum lag; analytics queries degrading the write primary.

**#10 — Live analytics aggregates on the hot data.**
- **Symptom:** `/admin/analytics` (and `/admin/ops` metrics) raw SQL over `Order`/`LedgerEntry` gets heavy; at 1M they compete with transactional load.
- **Bottleneck:** founder-analytics + ops-metrics aggregate live tables (now `unstable_cache` 300s + indexed — good for now), but at scale even cached recomputation is a big scan.
- **Fix:** **materialized rollups** (nightly/hourly cron writing summary rows) + serve the cockpit from rollups; run all analytics on a **read replica**. The Prompt-19 cockpit is already cache-isolated, so this is a drop-in swap of the impl behind the cached functions.
- **Trigger metric:** analytics query time > 1 s even cached; replica lag acceptable for 5-min-stale KPIs.

**#11 — Neon connection-pool saturation.**
- **Symptom:** intermittent `too many connections` / pooler timeouts under lambda concurrency spikes.
- **Bottleneck:** Vercel can spin many concurrent lambdas; each holds Prisma connections through pgbouncer; Neon caps total.
- **Fix:** keep the pooled URL (already correct), tune Prisma `connection_limit`, enable Neon autoscaling, and offload reads to a **read replica**.
- **Trigger metric:** pooler connection saturation %; `too many connections` errors.

---

## Phased scale roadmap (sequenced against load, mapped to existing build steps)

| Phase | Trigger | Do | Existing step / new |
|---|---|---|---|
| **P0 — interim, cheap** | search P95 > 300 ms | `pg_trgm` GIN index on title/description; keyset "load more"; cap exact counts | new (1 migration) |
| **P1 — shared state** | > 1 warm instance (already true) / abuse | **Upstash Redis**: shared rate limiter + WAF + Socket.io Redis adapter | **Step 32** |
| **P1 — search engine** | search still hot after P0 | **Algolia** (typo-tolerance, facets, sub-50 ms), sync on write | **Step 28** |
| **P2 — durable side effects** | delivery-rate < 99% / lost effects | durable queue (QStash/BullMQ) for notifications, referral, tickets, auto-release | new (worker on Railway) |
| **P2 — wallet read** | ledger > 5k rows/wallet | authoritative running balance + reconciliation job | new |
| **P2 — realtime scale** | sockets > 10k | horizontal Socket.io behind sticky LB + Redis adapter | extends Step 32 |
| **P3 — read/write split** | analytics degrading primary | **read replica** for analytics/admin; materialized rollups behind the cached cockpit fns | new |
| **P3 — table growth** | largest table > ~50M rows | time-partition `LedgerEntry`/`Message`/`AuditLog`/`Notification` + archival | new |
| **P3 — money hotspot** | platform-wallet lock waits | drop hot-path platform cached-balance / shard platform wallet | new |
| **continuous** | — | **Step 33 performance** (bundle, ISR, Core Web Vitals) runs alongside every phase | **Step 33** |

**What the existing steps miss (this audit adds):** durable queue (P2), Socket.io horizontal scaling + Redis adapter (P1/P2), read replicas (P3), materialized analytics rollups (P3), append-table partitioning (P3), and platform-wallet contention (P3). Steps 28/32/33 cover search, shared-state/WAF, and front-end perf respectively.

**Guiding principle (from the incumbents):** stay a **modular monolith** far past the first million — extract only the **realtime tier** (already separate on Railway) and a **worker tier** (the durable queue). Move search to a dedicated engine, make rate-limit + realtime state **shared** (Redis), make side effects **durable** (queue), and make heavy analytics **scheduled rollups** — never live aggregates on the hot path. Do not microservice early.
