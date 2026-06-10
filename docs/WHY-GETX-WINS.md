# Why GETX Wins — Competitive Moat & Strategy

> Living strategy document (Audit Prompt 20). The north star every build prompt serves.
> **Code-grounded and current** as of 2026-06-10 (Steps 01–15 MVP + audit prompts 11–19 + Step 22
> notifications built). Re-read at the start of every sprint; update the state tables as you ship.
>
> Method: every "built" claim below is traceable to a real file/service; every "not built" claim is
> verified against `prisma/schema.prisma` and `src/server/services/` — not assumed from the roadmap.

---

## 0. The crux — "Why should anyone choose GETX over Eldorado *today*?"

**Honest founder answer: a buyer shouldn't yet — because the market is still empty. That's fine,
because that's not the game. The game is to own ONE game's economy (Pokémon GO) so completely that
"the Pokémon GO marketplace" beats "another everything-store" for that one buyer.**

You cannot out-*broad* an incumbent (Eldorado/G2G have years of liquidity, brand, SEO). You out-*narrow*
them. Depth in one niche beats breadth in none.

The two believable wedges, **both now built**:

1. **Seller wedge (the real one, available today):** lower commission (6–8% vs 10–12%), a real public
   business identity (`/sellers/[id]` profile + verified reviews + one seller-reply), a **live trust
   score + 5-tier seller levels** (Bronze→Elite, with commission discounts/listing caps/payout-speed
   perks), buyer-protected escrow chat, and now a **founder analytics cockpit** + **real-time
   notifications**. On Eldorado you're a listing; on GETX you're a business.
2. **Buyer wedge (once pre-seeded):** the only place with this depth of Pokémon GO supply, **native
   UPI/INR** (Eldorado is crypto-only, G2G has no INR), default escrow on every transaction, and a
   24h dispute SLA (soon AI-minutes).

---

## 1. What is actually built (code-grounded, 2026-06-10)

**Production-grade (Steps 01–15 + audit prompts 11–19 + Step 22):**

| Capability | Status | Where |
|---|---|---|
| Auth + roles + Turnstile + email-verify gate + user ban | ✅ | `src/lib/auth.ts`, Step 03/15 |
| Niche catalog (5 games, 4 category kinds) + per-game SEO copy | ✅ | `src/config/games.ts` |
| Seller onboarding + manual KYC (private R2, admin-reviewed, signed GET) | ✅ | `kyc.ts`, Step 12/15 |
| Marketplace search/filter + listing detail | ✅ | `marketplace.ts`, Step 07 |
| Order state machine + idempotent create + stock-at-payment | ✅ | `orders.ts`, `apply-event.ts` |
| Payments: CoinGate (crypto, USD-billed) + Razorpay (UPI/INR, HMAC) + idempotent webhooks | ✅ | `payments/`, Step 09 |
| Escrow: append-only ledger, hold@PAID, release@COMPLETED, CAS idempotent, 3-day auto-release | ✅ | `escrow.ts`, Step 10 |
| Real-time chat (Socket.io on Railway, 3-layer authz) | ✅ | `socket-server/`, `chat.ts`, Step 11 |
| Reviews (verified-purchase only) + computed `ratingAvg/ratingCount` (FOR UPDATE) | ✅ | `reviews.ts`, Step 13 |
| Wallet + payouts (available/held split, reserve-on-request, compensating reversal) | ✅ | `payouts.ts`, Step 14 |
| Admin panel + KYC review + atomic `resolveDispute` + audit log | ✅ | `admin.ts`, Step 15 |
| **Live Trust Score + 5-tier seller levels** (Bronze→Elite, perks) | ✅ **NEW** | `trust-score.ts` (Prompt 11) |
| **Marketplace liquidity** (demand signals, new-seller boost, stale-pause cron) | ✅ **NEW** | `liquidity.ts` (Prompt 12) |
| **Revenue streams** (featured boost, GETX Pro subscription, spotlight sponsorship, instant-payout fee) | ✅ **NEW** | Prompt 15/15b |
| **Anti-fraud** (FraudFlag graph, device/IP fingerprints, risk score, auto-actions) | ✅ **NEW** | `fraud/` (Prompt 16) |
| **Marketplace SEO** (full listing+seller sitemap, AggregateRating/FAQ/Org JSON-LD, OG images, category copy) | ✅ **NEW** | Prompt 17 |
| **Notifications** (in-app bell + Resend email + Socket.io push, every lifecycle event) | ✅ **NEW** | `notifications.ts` (Step 22) |
| **Founder analytics cockpit** (`/admin/analytics`: GMV/revenue/take-rate trend, funnels, cohorts) | ✅ **NEW** | `founder-analytics.ts` (Prompt 19) |
| Sentry, CSP headers, two-bucket R2 | ✅ | Step 09/12 |

> The "trustScore = static 0" and "no notifications / no levels / no revenue / no fraud" gaps the
> original audit named are **CLOSED**. The reputation graph and seller lock-in moats are now real.

**Still NOT built (the honest remaining gaps):**

- **Auto-delivery engine** — `DeliveryType.INSTANT` exists as an enum but there is **no delivery
  service**; all delivery is MANUAL. *(Table-stakes for account codes / currency — see Gap #2.)*
- **AI layer** — `anthropic`/Claude is in the stack decision but **called nowhere in `src/`**. AI
  Dispute Judge, AI Support, AI Pricing are prompt-only. *(The primary defensible moat — Prompt 23 next.)*
- **PWA, i18n (next-intl), Algolia search, Sumsub automated KYC** — all Phase 2/3.
- **Founding-seller zero-commission flag** — the GTM offer below has no code yet (see §9).
- **Liquidity & brand** — operational, not code: 4 seed listings, zero organic traffic, zero GMV.

---

## 2. Comparison matrix — GETX vs incumbents (2026-06)

| Dimension | Eldorado | ZeusX | G2G | PlayerAuctions | **GETX today** |
|---|---|---|---|---|---|
| Take-rate | ~12–15% | ~10–12% | ~8–20% | ~5–10% + sub | **~13% (5% buyer + 6–8% seller), level discounts up to −5pts** |
| Escrow / protection | 3-day | yes | basic | Shield (paid) | **bank-grade, CAS idempotent, 3-day auto-release, default on every txn** |
| Dispute resolution | manual (days) | manual | manual | manual | **manual today; admin panel + atomic resolve built; AI judge = Prompt 23/25** |
| Crypto payments | yes | yes | limited | no | **yes (CoinGate, 30+ coins)** |
| **UPI/INR** | no | no | no | no | **yes (Razorpay native) — unique differentiator** |
| Trust/reputation | levels+score | some | levels | tiers | **live Trust Score + 5-tier levels + verified reviews** ✅ |
| Auto-delivery | yes | yes | yes | yes | **no — all manual (the real table-stakes gap)** |
| Real-time chat | yes | yes | yes | email | **yes (Socket.io, 3-layer authz)** |
| Fraud detection | mature | yes | yes | yes | **graph + risk score + auto-actions built (Prompt 16)** ✅ |
| AI features | none | none | none | none | **none yet — but a clean Claude-ready stack (the open moat)** |
| Notifications | email+in-app | email | email+in-app | email | **in-app bell + email + realtime push** ✅ |
| Seller visibility tools | featured/boost | some | boost | badge | **featured boost + Pro + spotlight sponsorship** ✅ |
| Founder/seller analytics | basic | basic | basic | basic | **founder cockpit built; seller CEO dashboard = Step 20** |
| Supply depth | 10k+ | 100s | 100k+ | 1000s | **~seed only — the #1 risk** |
| Brand / GMV | 10M+ | growing | 5M+ | 20M+ | **zero — pre-launch** |

**Read:** GETX has closed nearly every *product* gap and now leads on UPI, default escrow, and a
clean AI-ready stack. The remaining gaps are **liquidity/brand (execution)** and **auto-delivery + AI
(two builds)**.

---

## 3. Where GETX is still worse — face it directly

1. **Liquidity / cold-start (HIGHEST risk).** Seed listings only. A buyer who lands on empty
   categories leaves. *Antidote: pre-seed 60+ Pokémon GO listings from 10 sellers BEFORE admitting
   buyers (Prompt 12 + §6 GTM). Do not launch to buyers first.*
2. **No auto-delivery.** A buyer who gets a code in 30s on Eldorado won't wait for a seller to type
   it manually — even to save 2%. *Auto-delivery for accounts/codes is a Phase-1 requirement, not a
   nice-to-have. (Roadmap Step 19.)*
3. **No AI yet.** The AI moat (dispute judge / fraud / support) is the primary defensible advantage
   and is still prompt-only. *If it's not built by Month 6, GETX is "Eldorado with a smaller catalog."
   Prompt 23 is the next build.*
4. **Brand & traffic = zero.** Good SEO foundation (Prompt 17), zero organic sessions. *Wedge: surgical
   long-tail Pokémon GO SEO Eldorado doesn't dominate.*
5. **Network effects favour incumbents.** 10k reviews vs zero. *Only path: be the platform with 200
   Pokémon GO seller reviews when Eldorado has 40. Niche depth.*

---

## 4. The defensible moat (compounds over 12–24 months)

| Layer | What makes it hard to copy | Status |
|---|---|---|
| **1. Reputation graph (data)** | per-seller reviews/score/level can't migrate; `Review.orderId @unique` = clean data | ✅ **LIVE** (reviews + Trust Score + levels all compute automatically per sale) |
| **2. AI capability** | Claude `opus-4-8` dispute judge + fraud radar + support on a clean stack; 12-month project for legacy competitors | ⏳ **NEXT** (Prompt 23 AI layer; Steps 16/25) |
| **3. Seller lock-in (switching cost)** | level/badge earned not transferable; CEO dashboard history; (future) loyalty | ✅ levels live; ⏳ seller CEO dashboard (Step 20) + loyalty (Step 21) |
| **4. Niche community (network)** | game-specific guides/leaderboards/creator badges → winner-take-most within the niche | ⏳ Step 27 (catalog foundation built) |

Layers 1 and 3 (partly) are now real and compounding with every transaction. Layer 2 is the open,
highest-value build. Layer 4 is the long game.

---

## 5. Phase-2 priority sequencing — by survival-criticality, not roadmap number

**Done since the original audit:** ✅ Trust Score (Prompt 11) · ✅ Liquidity (Prompt 12) · ✅ Notifications
(Step 22) · ✅ Fraud Radar primitives (Prompt 16) · ✅ Founder analytics (Prompt 19).

**Remaining, in order:**

1. **Auto-delivery (Step 19 roadmap)** — table-stakes for codes/accounts; manual kills conversion.
2. **AI Dispute Judge + AI layer (Prompt 23 / Step 25)** — primary moat; target ≤ Month 6.
3. **AI Support 24/7 (Step 16)** — cuts the #1 ops complaint (support latency).
4. **Seller CEO dashboard (Step 20)** — retention; build once GMV exists to display.
5. **Loyalty + referral (Step 21 / Prompt 22)** — growth flywheel when retention is the constraint.
6. **Community (Step 27), PWA (Step 24), i18n (Step 23), Algolia (Step 28), Sumsub (Step 29)** — scale.

---

## 6. GTM wedge — dominate Pokémon GO first

- **Month 0–1 (pre-launch, do NOT open to public):** personally onboard 10 trusted Pokémon GO sellers
  (Telegram, r/TheSilphRoad, r/pokemongotrades, Discord). Offer **zero commission on first 20 sales**.
  Seed **60+ listings** across all 4 category kinds. Test the full loop with real money. Resolve 3
  real disputes manually (these become AI Dispute Judge training examples).
- **Month 1–3 (soft launch in-niche):** long-tail SEO ("buy pokemon go account India", "pokemon go
  account level 40 for sale", "pokemon go coins cheap"). "No fees for 30 days" recruitment event.
  Demand-signal capture for buyers (Prompt 12, live). **Public line: no second game until Pokémon GO
  has 30 verified sellers + 500 completed transactions.**
- **Month 4–6 (second game):** repeat seeding for the demand-validated next game (likely CoC). Ship the
  AI Dispute Judge; use it as press ("first AI-powered dispute resolution in a gaming marketplace").
- **Never:** launch all 5 games at once without seeded supply.

---

## 7. ☠️ Kill criteria — top 10, with current mitigation state

| # | Failure mode | Early-warning signal | Mitigation | State |
|---|---|---|---|---|
| 1 | **No liquidity** (cold-start) | listings/category < 5; time-to-first-sale ↑ | Prompt 12 + GTM pre-seed | engine ✅; **execution pending (top risk)** |
| 2 | **Wrong game** | PoGo demand flat; publisher ban risk | validate demand before depth | ongoing |
| 3 | **Fraud / stolen accounts** | dispute ↑, chargeback ↑, multi-account | Prompt 16 fraud graph + risk score | ✅ built |
| 4 | **Chargebacks** | chargeback % > threshold | crypto-first for high-risk + ops | partial (crypto ✅; backup gateway pending) |
| 5 | **Seller churn** | Elite/Gold retention ↓ | levels + Pro + community | levels ✅; community ⏳ |
| 6 | **Poor SEO / no traffic** | organic sessions flat | Prompt 17 SEO + content | ✅ foundation; content pending |
| 7 | **No differentiation** | "why not Eldorado" unanswered | UPI + escrow + AI layer | UPI/escrow ✅; **AI ⏳ (Prompt 23)** |
| 8 | **High CAC / no viral loop** | CAC > LTV; K-factor < 1 | referral/viral (Prompt 22) + SEO | ⏳ referral next |
| 9 | **Slow ops at scale** | SLA breaches; queue depth ↑ | AI deflection + notifications + ops | notifications ✅; AI/ops ⏳ |
| 10 | **Weak/invisible trust** | trust filter unused; low buy-conversion | Trust Score + escrow UX + badges | ✅ **now real (was the #1 preventable risk — closed)** |

> The single most likely killer is **#1 liquidity (execution)**. The formerly-most-preventable
> **#10 (invisible trust)** is now **closed** — Trust Score, levels, verified badges, and notifications
> all ship. Defend #1 and #7 (AI differentiation) next.

---

## 8. Why incumbents can't simply copy GETX

- **Eldorado:** no UPI (12–18mo + Indian entity to add); manual-dispute ops culture; "listing-poster"
  seller model their take-rate is built around.
- **G2G:** 200-game breadth is their brand — can't go niche without alienating their base; no real-time chat.
- **ZeusX:** heavy seller paperwork (GETX's 5-min onboarding answers it); small team, can't out-invest on AI.
- **PlayerAuctions:** 1999-era tech debt, poor mobile; paid "Shield" signals protection isn't default —
  GETX escrows every transaction by default.

---

## 9. Recommended next concrete code (the one GTM mechanic with no code yet)

The zero-commission founding-seller offer (§6) needs a safe, capped implementation before outreach:

- Add `isFoundingSeller Boolean @default(false)` + `foundingSalesUsed Int @default(0)` to `SellerProfile`.
- In `computeSellerCommissionMinor` (`src/lib/fees.ts`): if `isFoundingSeller && foundingSalesUsed < 20`,
  return **0** commission; increment `foundingSalesUsed` at order COMPLETED (in the escrow release tx).
- Hard cap: 20 sales/seller, admin-set flag only, audit-logged. *(Not yet built — flagged here so the
  GTM offer isn't a manual promise. Money-path change → build with its own QA + adversarial review.)*

Everything else this strategy needs is already shipped.

---

## 10. The one-paragraph "why switch" (use grounded, never fake metrics)

**Seller:** "On Eldorado you're a listing. On GETX you're a business — 6–8% vs 10–12%, your own public
profile with verified reviews, a live trust score and seller levels that lower your fees as you grow,
buyer-protected chat, real-time alerts, and zero commission on your first 20 sales. We grow together."

**Buyer (post-seed):** "The deepest Pokémon GO supply with verified sellers and real reviews, pay by
**UPI** (no crypto wallet needed), escrow buyer-protection on every order, and disputes resolved fast."

> Do not claim GMV or user counts you don't have (see the fake-metrics decision in DECISIONS.md). The
> wedge is honest because every mechanic above is built — only liquidity is execution.
