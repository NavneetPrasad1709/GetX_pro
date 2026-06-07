# GETX — Marketplace Audit Report

> Build: Step 07/36. Verified from code. Focus: core marketplace flows + feature matrix.

## 1. Feature matrix (verified)

| Feature | State | Evidence / gap |
|---|---|---|
| Browse games / categories | ✅ Built | `/games`, `/games/[slug]`, `/games/[slug]/[category]` (cache()-services, ACTIVE-only). |
| Search (title+desc) | ✅ Built | `searchListings` ILIKE; debounced URL filter bar. |
| Filters (game/type/price/delivery/trust/rating/currency) | ✅ Built | `lib/validators/marketplace.ts`; currency = param-only (no UI, INR-only MVP). |
| Sort + pagination | ✅ Built | newest/price↑↓/rating/trust + `id` tiebreaker; server-side, 24/page. |
| Listing detail | ✅ Built | gallery, trust panel, buy box, JSON-LD, attributes, out-of-stock, real 404 gate. |
| Seller **public profile page** | ❌ Missing | Trust panel shows seller info, but there is **no `/seller/[id]` public storefront** to click through to. Buyers can't see a seller's other listings or full history. |
| **Cart** | ❌ Missing | Single-item buy only. Acceptable for account/one-off items; reconsider for currency/top-ups. |
| **Checkout** | ❌ Missing | `/checkout` route does not exist → **Buy now 404s**. (Step 08) |
| **Order creation / state machine** | ❌ Missing | `Order` model exists; **no service/action creates one.** (Step 08) |
| **Payment** | ❌ Missing | No CoinGate/Razorpay/webhook code. (Step 09) |
| **Escrow / delivery / release** | ❌ Missing | UI promises escrow; no logic. (Step 10) |
| **Chat with seller** | ❌ Missing | `/chat/new` 404s. (Step 11) |
| **Reviews** | ❌ Missing | Seller `ratingAvg/ratingCount` are seed-only; no review creation. (Step 13) |
| **Wishlist / favourites** | ❌ Missing | Common marketplace retention feature — not planned in roadmap. |
| **Recently viewed / related listings** | ❌ Missing | Detail page has no "more from this seller" / "similar" → lost cross-sell. |

## 2. Core transaction flow — **ENTIRELY ABSENT**

The requested flow (buyer orders → pay → order created → seller notified → deliver → confirm →
funds released → complete) **has zero implementation.** Verified: no `createOrder`, no payment
provider client, no `webhook` route, no escrow service, no notification dispatch. The `Order`,
`Payment`, `LedgerEntry`, `ProcessedWebhook`, `Dispute` models exist in `schema.prisma` (Step 02)
but are never written to.

**Therefore the following cannot yet be tested** (they don't exist): broken state, race conditions,
duplicate order creation, duplicate payment, missing notifications, DB inconsistency. The *design*
guardrails are sound (append-only ledger, idempotent webhooks, explicit state machine, server-side
+ in-transaction) — see `docs/ENGINEERING-GUARDRAILS.md`. Re-audit this section after Step 10.

## 3. Marketplace quality findings (on what exists)

| Sev | Finding | Fix |
|---|---|---|
| 🟠 High | No seller public storefront — the trust panel is a dead-end (no link to seller's other listings). Hurts trust + liquidity. | Add `/seller/[id]` (or `/u/[slug]`) public profile listing the seller's ACTIVE items + aggregate trust. |
| 🟡 Med | Detail page has no related/"more from seller" listings → no cross-sell, higher bounce. | Add a "More from {seller}" + "Similar in {category}" rail (reuse `ListingCard`). |
| 🟡 Med | ILIKE `contains` does not escape `%`/`_` wildcards in the query. Not a security issue (parameterized) but a user searching "50%" gets odd matches. | Escape LIKE metacharacters, or move to trigram/Algolia (Step 28). |
| 🟢 Low | ACTIVE listings with `stock = 0` still appear in results (out-of-stock shown only on detail). | Optionally add a "hide sold out" filter or sink them in sort. |
| 🟢 Low | No empty-catalog merchandising (e.g., "Pokémon GO" first per strategy) beyond newest sort. | Consider a curated/featured ordering for the launch niche. |

## 4. Marketplace verdict
The **discovery half** of the marketplace is genuinely strong and launch-quality. The **transaction
half does not exist.** A marketplace is defined by completed trades — so as a *marketplace*, this is
**~25% complete.** Discovery: 8.5/10. Transaction: 0/10.
