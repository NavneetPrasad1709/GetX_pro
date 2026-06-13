# GETX — MARKETPLACE IMPROVEMENT MASTER PLAN

> CTO-level pre-scale audit of **getx.live**. Produced from a multi-agent audit that read the
> real codebase (ground-truth feature map → 13 domain audits → adversarial verification of every
> Critical/High finding against the source). Every task below is grounded in real `file:line`
> evidence and ordered in exact implementation sequence.
>
> **Method note:** 41 audit agents, 121 findings, all cross-checked against code. Where a claim was
> softened by verification it is flagged inline (e.g. live inventory is *thin*, not *zero*).
>
> Companion doc: **`COLOR_SYSTEM_REDESIGN.md`** (Phase 7 design tokens + per-page redesign).

---

## 0. EXECUTIVE SUMMARY

**Verdict:** GETX is an unusually *well-engineered* marketplace for a solo build — the money plumbing
(append-only ledger, idempotent CAS payouts, escrow state machine, ownership re-checks in transactions),
the trust/escrow UX, KYC, disputes (+ AI judge), filters/sort, and SEO foundations are genuinely
**production-grade and ahead of most MVPs**. The core "fast + AI-powered trust" thesis is real and visible.

**But it cannot yet honestly call itself a marketplace, for one reason:** the payout system collects a
*method* ("Bank/UPI" or "Crypto") but **never collects a destination** (no UPI ID / account number / IFSC /
wallet address). A seller can earn, see a balance, click "Request withdrawal" — and the money can never
leave. Fix this before anything else.

Around that, the gap to market leaders is **not** the core marketplace — it is the **discovery + retention
loop**: no wishlist, no saved searches/alerts, no recently-viewed, no dynamic social proof, autocomplete
dormant in prod, and the **notification bell is built but invisible** on the shop + dashboard. Many of the
highest-ROI wins are *un-hiding features that already exist*.

### First-impression scorecard (reconciled from auditors)

| Dimension | Score | One-line justification |
|---|---|---|
| **Trust** | 7 / 10 | Escrow story is best-in-class; but 100% promise-based — no real numbers/proof above the fold. |
| **Visual** | 7 / 10 | Premium hero, clean v10 dark system — but flat, single-accent, low hierarchy below the fold (owner's concern confirmed). |
| **Professional** | 8 / 10 | Polished, consistent, no obvious jank; reads as a real product. |
| **Marketplace feel** | 4.5 / 10 | Thin inventory (~1 listing/game) + empty paid rails + no social proof → reads pre-launch. |
| **Conversion** | 4 / 10 | No retention loop, hidden bell, dead autocomplete, weak urgency/social proof. |
| **Overall (weighted)** | **≈ 5.5 / 10** | Excellent foundation, under-converted. The fixes are mostly *exposure + retention*, not rebuilds. |

### Competitor verdict (vs Eldorado.gg · G2G · PlayerAuctions · ZeusX)

- **BETTER:** escrow transparency (stepper + per-status "what happens next"), live trust score on cards/PDP/checkout, AI Dispute Judge + Shield add-on, honest no-fabricated-metrics stance, crypto+UPI (real chargeback immunity for sellers).
- **EQUAL:** PDP quality, faceted filters + 6 sorts, checkout (one-press pay), seller profiles, merchandising (promoted + spotlight).
- **WORSE:** wishlist/favourites (missing), saved searches & price/restock alerts (missing), recently-viewed (missing), social proof / recent-sales (missing), search autocomplete (dormant in prod), multi-item cart (single-item only).

### Top 10 to fix THIS WEEK (highest trust/revenue ROI)

| # | Fix | Why | Effort |
|---|---|---|---|
| 1 | **Payout destination capture** | Sellers literally cannot be paid. Existential. | L |
| 2 | **Expose NotificationBell on shop + dashboard headers** | Fully built; invisible where logged-in users live. Pure exposure. | S |
| 3 | **Always-on "Fresh listings" rail on homepage** | Homepage shows no products → reads pre-launch. | M |
| 4 | **Fix `Buy now` dropping `callbackUrl`** | Logged-out buyer loses the listing → lands on dashboard. | S |
| 5 | **Fix guides/leaderboard seller links (404)** | Every community→seller link is a 404 (`User.id` vs `SellerProfile.id`). | S |
| 6 | **Real social proof from existing data** (sold N, viewers, recent-sold rail) | #1 cold-start CRO lever; data already in DB. | M |
| 7 | **Anchor PDP sticky Buy bar to `bottom-0`** | Floats 74px above edge on mobile → reads as a glitch. | S |
| 8 | **Set Google/Discord OAuth keys in prod** | One-click signup renders nothing without keys. | S |
| 9 | **Money-back guarantee seal beside the Buy CTA** | Strongest objection-killer is buried as grey text. | S |
| 10 | **Instant-payout fee not refunded on failure** | Money-path reconciliation bug. | M |

---

## How to read each task

```
### {ID} — {Title}            [Priority · Effort · Revenue impact]
Page / Surface · Exact files affected · Components affected · Database impact ·
API impact · UI impact · Risk level · Testing checklist · Acceptance criteria
```

Effort: **S** ≈ <4h · **M** ≈ 0.5–1.5d · **L** ≈ 2–4d · **XL** ≈ 1wk+. All tasks end with the standard
gate: `npm run typecheck && npm run lint && npm run build` + the task-specific QA harness.

---

# Phase 0 — OWNER DIRECTIVES (live feedback 2026-06-12) — DO FIRST

> Owner reviewed the LIVE site and issued direct instructions. **These supersede the audit ordering** and
> are the immediate work queue ("wasting time = wasting money"). Each is verified against real code below.
> A few items need owner input before build — flagged **⛔ NEEDS OWNER INPUT**.
>
> **Reconciliation with the audit:** three audit tasks change because of these directives —
> (a) **P10-T1** listing caps are *removed* (listings are now unlimited); (b) **P1-T1** payout becomes
> **USD + international + KYC-gated**; (c) verified-seller proof (**P2-T1/T3/T4**) only renders for sellers
> who have actually passed KYC, because **O-T2** makes verification mandatory.

### O-T1 — Switch display currency INR → USD (no INR; not targeting India) [Critical · M · —]
- **Page / Surface:** entire app (prices, fees, referral credits, payouts, Pro pricing).
- **Exact files:** `src/lib/money.ts:32` (default `currency = "INR"` → `"USD"`; `en-IN`→`en-US`), hardcoded `"INR"` in `src/server/services/payouts.ts:75,229`, `src/server/services/listings.ts:220,542`, `src/server/services/monetization.ts:229,347` → `"USD"`; `src/config/site.ts:13` (`currencies` add `"USD"` as primary, drop `INR`), `src/config/site.ts` fee amounts (re-price — see ⛔), `src/app/(dashboard)/seller/subscription/page.tsx:64,84` (`₹0`, `formatMoney(...,"INR")`), referral copy (`₹25/₹50` welcome/earn credit → USD), `docs/FEES.md`.
- **Components affected:** Price, anywhere `formatMoney` is called with `"INR"`, referral page, Pro page, fees page.
- **Database impact:** Existing `Wallet.currency`/`Listing.currency` rows are `INR`. **Decision needed**: new rows = `USD`; existing test rows can be wiped (test data) — confirm no real money rows exist before migrating defaults.
- **API impact:** all `formatMoney`/`parsePriceToMinor` default to USD; `pg`/Razorpay (INR-only) flagged in ⛔.
- **UI impact:** every `₹` becomes `$`.
- **DECISION (owner 2026-06-12):** (1) **convert + round** — propose USD prices (~₹83=$1, clean numbers) for one-tap approval, then apply. (2) **Keep Razorpay + display USD** → checkout converts USD→INR via an FX rate at order time (Razorpay settles INR); CoinGate already prices crypto in USD. Build an `FX_USD_INR` source (env/config, updated periodically) used only at the Razorpay charge step; ledger/escrow stay in the order's stored currency. (3) Referral ₹25/₹50 literal-converts to ~$0.30/$0.60 (too small) → propose sensible USD in the price table.
- **Risk level:** Medium (money display — never silently convert stored amounts).
- **Testing checklist:** every screen shows `$`; no `₹` remains (grep `₹` + `en-IN` returns only intentional spots); `parsePriceToMinor` round-trips USD; build green.
- **Acceptance criteria:** App displays USD end-to-end; no INR anywhere a global buyer/seller sees.

### O-T2 — Mandatory KYC verification BEFORE becoming a seller (legal / anti-lawsuit) [Critical · L · —]
- **Page / Surface:** `/become-seller`, `/seller/*`, listing creation.
- **Exact files:** `src/components/auth/become-seller-form.tsx` + `src/server/actions/auth.ts` (`becomeSellerAction`) — gate shop creation/selling on KYC; `src/server/services/listings.ts` create path (block until `kycStatus === "APPROVED"`); `src/app/(dashboard)/become-seller/page.tsx:` copy ("first listing free" / "2 minutes" → "verify your ID first"); `src/components/seller/onboarding-checklist.tsx` (make KYC step 1, blocking).
- **Components affected:** BecomeSellerForm, onboarding checklist, listing form, seller hub gating.
- **Database impact:** None new (uses `SellerProfile.kycStatus`); a user may create a *pending* seller profile but cannot **list/sell** until APPROVED.
- **API impact:** `becomeSellerAction` → route into KYC; `createListing` throws if not KYC-approved; seller hub shows a blocking "Verify to start selling" state.
- **UI impact:** Selling is gated behind verification; the easy "Open my shop — free → straight to /seller" flow (`become-seller-form.tsx:36-38`) now routes to `/seller/verify` first.
- **Risk level:** Medium — changes the core onboarding funnel (intended; legal requirement). **Supersedes** the audit's "make selling frictionless" framing.
- **Testing checklist:** Un-verified user cannot create a listing (server-enforced); verified user can; clear messaging at every block; existing sellers without KYC are prompted/grandfathered per owner choice.
- **Acceptance criteria:** No one can list/sell without an APPROVED KYC. ("We cannot be greedy to have them sell first.")

### O-T3 — Fix broken manual KYC upload + wire Sumsub SANDBOX [Critical · M · —]
- **Page / Surface:** `/seller/verify` (screenshot shows `Load failed (getx-private.…r2.cloudflarestorage.com)`).
- **Exact files:** `src/app/(dashboard)/seller/verify/page.tsx`, `src/components/seller/kyc-upload-form.tsx`, `src/components/seller/sumsub-kyc-widget.tsx`, `src/app/api/uploads/presign/route.ts`, `src/lib/r2.ts`, R2 **bucket CORS** config (the private bucket must allow the prod origin for browser `PUT`; a direct `GET` of a private object without a signed URL will fail — confirm nothing renders a raw `getx-private…r2.cloudflarestorage.com` URL).
- **Database impact:** None. **API impact:** verify presign returns a valid signed `PUT` URL; R2 CORS allows `https://www.getx.live`; no raw private-bucket URL is ever loaded in an `<img>`.
- **UI impact:** Manual upload works; Sumsub sandbox widget renders when sandbox keys are set.
- **⛔ NEEDS OWNER INPUT:** **Sumsub SANDBOX credentials** (app token + secret key from the owner's Gmail Sumsub account) → set `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_ENABLED=true` (sandbox) in Vercel env.
- **Risk level:** Medium (PII + external integration). **Testing:** upload a test ID end-to-end (manual path) → admin sees it; Sumsub sandbox flow completes a test applicant; the `Load failed` error is gone; R2 CORS verified.
- **Acceptance criteria:** Both manual and Sumsub-sandbox verification complete without error in prod.

### O-T4 — Remove "Verified / ID-verified sellers" claims until verification is real [High · S · —]
- **Page / Surface:** hero trust badges, trust ribbon, listing cards, PDP.
- **Exact files:** `src/components/layout/trust-ribbon.tsx:23` ("Verified sellers"), `src/components/shared/trust-badge.tsx` (`verified` variant), `src/components/home/home-hero.tsx:79` (`<TrustBadge variant="verified" />`), `src/components/marketplace/listing-card.tsx` + `seller-trust-panel.tsx` + `shared/verified-badge.tsx` (only render when `kycStatus === "APPROVED"`).
- **Database impact:** None. **API impact:** badge rendering keyed off real `kycStatus`. **UI impact:** "Verified" only appears on sellers who actually passed KYC (truthful once O-T2/O-T3 land). Until then, replace the blanket "Verified sellers" promise with "Escrow-protected" wording.
- **Risk level:** Low (truth-in-advertising; reduces legal exposure). **Testing:** no "verified" claim shows for un-verified sellers; badge appears only post-KYC.
- **Acceptance criteria:** Every "verified" claim maps to a real APPROVED KYC. (Pairs with O-T2.)

### O-T5 — Unlimited listings: remove Free/Pro listing caps [High · S · —]
- **Page / Surface:** listing creation, `/seller/subscription`, seller hub.
- **Exact files:** `src/server/services/listings.ts:184-186` (remove the `proMaxListings/freeMaxListings` cap check), `src/config/site.ts:56-57` (remove `proMaxListings/freeMaxListings`), `src/app/(dashboard)/seller/subscription/page.tsx:29,35` (drop "Up to N active listings" from both plans), `src/app/(dashboard)/seller/page.tsx:175-176` (Pro upsell copy), `docs/FEES.md:79`.
- **Components affected:** listing form, GETX Pro page, seller hub Pro card.
- **Database impact:** None. **API impact:** no active-listing-count gate on create. **UI impact:** Pro keeps commission discount + badge + priority support + analytics; "listing limit" removed everywhere.
- **Risk level:** Low. **Testing:** a Free seller can create >10 listings; no cap error; Pro copy no longer mentions limits.
- **Acceptance criteria:** Listings are unlimited for all tiers. **(Updates P10-T1 — the listing-cap portion is dropped.)**

### O-T6 — Country: required + dropdown of country names [Medium · S · —]
- **Page / Surface:** `/become-seller`.
- **Exact files:** `src/components/auth/become-seller-form.tsx:94-117` (free-text `Input` → `NativeSelect` of countries; remove `(optional)`), `src/lib/validators/auth.ts` (`becomeSellerSchema` — `country` required, enum/ISO list), **new** `src/config/countries.ts` (ISO-3166 list).
- **Database impact:** None. **API impact:** server rejects empty/invalid country. **UI impact:** user-friendly searchable country dropdown.
- **Risk level:** Low. **Testing:** cannot submit without a valid country; dropdown lists countries; server validates.
- **Acceptance criteria:** Country is mandatory and chosen from a list, not typed.

### O-T7 — Notification bell/bar for sellers in the dashboard [High · S · High]
- Same task as **P6-T1** — mount `NotificationBell` in `AppTopbar` (dashboard/seller/admin) and `MarketplaceHeader`. Owner explicitly requested it for sellers. See **P6-T1** for the full spec.

### O-T8 — Homepage: one search (not two), bigger search bar, shorter hero [High · M · Medium]
- **Page / Surface:** `/` (homepage).
- **Exact files:** `src/components/layout/site-header.tsx:54-57` (hide the header `HeaderSearch` on the homepage — it duplicates the hero search; or drop the hero one — keep ONE), `src/components/home/home-hero.tsx:20,54-67` (reduce hero vertical padding `pt-9 pb-10 min-[761px]:pt-[74px] pb-[60px]` so content below peeks; enlarge `HeaderSearch` width/height for a friendlier search).
- **Components affected:** SiteHeader, HomeHero, HeaderSearch.
- **Database impact:** None. **API impact:** None. **UI impact:** single prominent search; hero shorter so the "Browse listings" + fresh-listings rail (P1-T3) are visible without much scroll.
- **Risk level:** Low. **Testing:** homepage shows exactly one search; search bar visibly larger; below-fold content peeks at common viewport heights (768/900/1080).
- **Acceptance criteria:** No duplicate search; bigger search; shorter hero.

### O-T9 — Hide "Sell" CTA once the user is a seller [Medium · S · —]
- **Page / Surface:** global header.
- **Exact files:** `src/components/layout/site-header.tsx:99-102` (render the `Sell` `CtaLink` only when `user?.role !== "SELLER" && user?.role !== "ADMIN"`; for sellers show nothing or a "Seller hub" link).
- **Database impact:** None. **API impact:** None (role already on session). **UI impact:** sellers no longer see a redundant "Sell" button.
- **Risk level:** Low. **Testing:** buyer sees "Sell"; seller/admin does not.
- **Acceptance criteria:** "Sell" CTA hidden for existing sellers.

### O-T10 — Footer cleanup: remove Games + Top Categories columns + payment-methods row [High · S · —]
- **Page / Surface:** site-wide footer.
- **Exact files:** `src/config/nav.ts:56-105` (remove the `Games` and `Top categories` `footerNav` groups), `src/config/nav.ts:147` + `cinematic-footer.tsx` (remove `paymentMethods` / the "WE ACCEPT UPI Razorpay USDT BTC ETH" row — **payment-processor risk: do not advertise payment methods**), also fix the broken `/disputes` link (= **P1-T7**).
- **Components affected:** the footer (`cinematic-footer.tsx` / `slim-footer.tsx`).
- **Database impact:** None. **API impact:** None. **UI impact:** leaner footer; no payment-method advertising (the owner cites prior processor rejection for displaying payment methods).
- **Risk level:** Low — but note this removes internal crawl links from the footer (games/categories); keep them discoverable via the games mega-nav so SEO equity isn't lost.
- **Testing checklist:** footer no longer shows games/top-categories/payment row; no broken links; games still reachable via nav.
- **Acceptance criteria:** Footer carries no payment-method advertising and no games/top-categories columns.

### O-T11 — "Looks AI-generated" → premium, non-generic UI [High · L · Medium]
- The owner's "this clearly looks like an AI website" maps to the **Phase 7 Premium UI Upgrade** + **`COLOR_SYSTEM_REDESIGN.md`** (elevation, depth, trust color, real product imagery, less templated rhythm). Prioritize the token + elevation work (P7-T1) and the homepage fresh-listings rail (P1-T3) — empty + flat is what reads as "AI demo".
- **Acceptance criteria:** Home/PLP/PDP feel layered, populated, and brand-distinct (see Phase 7 + COLOR doc acceptance criteria).

### O-T12 — Settings page — ⛔ SEND SPEC FOR APPROVAL BEFORE BUILDING [Blocked]
- Owner: *"settings mai jo jo upload karoge pehle uski info idhar bhejo"* — propose the Settings contents and get sign-off before building (this is **P3-T5**, now gated on approval). **Proposed scope (for approval):**
  1. **Profile** — display name, avatar, bio.
  2. **Account security** — change password (invalidate other sessions), change email (re-verify).
  3. **Payout account** — the destination from P1-T1/O-T1 (USD/crypto/bank).
  4. **Notification preferences** — already exists at `/settings/notifications` (fold in).
  5. **Danger zone** — deactivate/delete account (GDPR-style).
- **Status — APPROVED (owner 2026-06-12):** build **all four** — (1) Profile (name/avatar/bio), (2) Security (password + email re-verify), (3) Payout account (USD/crypto/bank, ties to P1-T1), (4) Delete/deactivate account. Notification prefs (`/settings/notifications`) folds in as a tab. Unparks **P3-T5**.

### O-T13 — Kill internal dev-step labels leaking into the live UI [High · S · —]
- **Page / Surface:** New listing form (and any other user-facing "Step NN" text).
- **Exact files:** `src/components/seller/listing-form.tsx:445` (`blurb: "Auto-delivered codes/top-ups (Step 19)"` → `"Auto-delivered codes & top-ups"`). Grep the whole `src/` for user-facing `Step \d+` strings (comments/docs are fine; **UI copy is not**). Also the new-listing **price label** `listing-form.tsx:373` `Price (₹ INR)` → USD (covered by O-T1).
- **DB/API impact:** None. **UI impact:** professional copy; no internal roadmap numbers shown to users.
- **Risk:** Low. **Testing:** grep finds no `(Step N)` / `Step N` in rendered strings; new-listing form reads clean.
- **Acceptance criteria:** No internal step/roadmap references anywhere a user can see.

### O-T14 — Boosting: never "Instant", and time in HOURS not days [High · S · —]
- **Page / Surface:** New/edit listing form (BOOSTING category).
- **Exact files:** `src/components/seller/listing-form.tsx:442` (gate the `INSTANT` delivery option — hide/disable when `category === "BOOSTING"`; boosting is always MANUAL), `src/components/seller/listing-form.tsx:90-91` + `src/config/games.ts:142` (`estimatedDays` "Estimated days" → "Estimated time (hours)" with helper e.g. `6`), the boosting-details validator/schema (rename/relabel the field; keep stored as a number of hours), and any PDP rendering of boosting ETA.
- **DB impact:** If a typed field exists, relabel to hours (data is a number — no migration needed; just unit + copy). **API impact:** validator copy/label only.
- **UI impact:** Boosting listings can't pick Instant; ETA captured/shown in hours.
- **Risk:** Low. **Testing:** Boosting category shows only Manual delivery; ETA field says hours; account/item/currency categories unaffected.
- **Acceptance criteria:** No boosting listing can be marked Instant; boosting time is expressed in hours.

### O-T15 — Remove "Bump" monetization (no pay-to-win bias against sellers) [High · M · —]
- **Page / Surface:** `/seller/listings` (Bump button), listing ordering.
- **Exact files:** delete `src/components/seller/bump-listing-button.tsx`; remove the Bump button from `src/app/(dashboard)/seller/listings/page.tsx`; remove `bumpListing` from `src/server/services/monetization.ts` + its action in `src/server/actions/monetization.ts`; remove `boost.bumpFeeMinor`/`maxBumpsPerDay` from `src/config/site.ts`; remove `computeBumpFeeMinor` from `src/lib/fees.ts` (+ its test in `src/__tests__/unit/fees.test.ts`); stop using `bumpedAt/lastBumpAt/bumpCount` in `src/server/services/marketplace.ts` newest-sort (columns can stay, unused); update `docs/FEES.md`.
- **DB impact:** Leave `Listing.bumpedAt/lastBumpAt/bumpCount` columns (no destructive migration) — just stop reading/writing them. **API impact:** remove the bump action + service.
- **UI impact:** No Bump button; "newest" sort is purely chronological (fair).
- **Risk:** Low-Medium (touch the sort + remove a fee path) — keep typecheck green after removing `computeBumpFeeMinor` references.
- **Testing:** No Bump anywhere; newest sort isn't pay-influenced; `qa-step*` + unit tests green.
- **Acceptance criteria:** Bump fully removed; ranking can't be bought via bump. **(Note for owner: Boost + Spotlight are also pay-for-visibility — say the word and I'll apply the same fairness rule to them.)**

### O-T16 — Remove paid "Shield" add-on; make full money-back UNIVERSAL & FREE (consumer-law / lawsuit risk) [Critical · M · —]
- **Why:** In many countries' consumer-protection law, a buyer who doesn't get a full refund on a valid dispute can penalise the company — so **charging extra ("Shield") to "guarantee" a full refund is a legal trap**: it implies non-Shield buyers might not be fully refunded. Fix = full money-back is the **default for every order, free.**
- **Page / Surface:** PDP buy box, `/checkout`, listing form, escrow window.
- **Exact files:** remove `fees.shield` from `src/config/site.ts`; remove Shield calc from `src/lib/fees.ts` (+ test in `src/__tests__/unit/fees.test.ts`); remove the "Add Shield protection" toggle from `src/components/marketplace/buy-box.tsx`; remove the Shield line from `src/app/(checkout)/checkout/page.tsx` + `src/components/checkout/checkout-pay-button.tsx`; drop the shield flag from `src/lib/validators/order.ts`; remove Shield-extended-escrow branches in `src/server/services/escrow.ts` / `orders.ts` / `payments/apply-event.ts` so **all** orders use the standard `escrow.autoReleaseDays`; update trust copy on `escrow-protection-panel.tsx` / `checkout-trust-badges.tsx` / `trust-safety` page to "Full money-back guarantee on every order — free."
- **DB impact:** If orders store a `shield`/extended-window field, default it off and ignore (no destructive migration needed). **API impact:** remove shield from order creation + escrow timing.
- **UI impact:** No paid Shield; money-back guarantee shown as a universal, free promise (stronger trust signal anyway — matches the v3 sample).
- **Risk:** **Medium** — touches order money/escrow timing; keep escrow reconciliation intact (standard window for all). Re-run `qa-step08/09/10/14`.
- **Testing:** No Shield UI/fee; every order gets full-refund-on-dispute by default; escrow auto-release uses the single standard window; money tests green.
- **Acceptance criteria:** Protection is universal and free; no upsell implies lesser protection without it. **(Updates P10-T2 — Shield revenue lever removed.)**

### O-T17 — Hide payment-provider names (Razorpay / CoinGate) from the UI [High · S · —]
- **Why:** Don't advertise the processor on user-facing screens (cleaner UX + the documented processor-rejection risk). Show neutral method labels; provider stays only in backend/webhook code.
- **Page / Surface:** checkout payment method picker, payout form.
- **Exact files:** `src/components/orders/pay-now.tsx:22-26` — `"UPI / Cards (Razorpay)"` → `"UPI / Cards"`, hint `"Pay in INR"` → drop (or "Cards & UPI"); `"Crypto (CoinGate)"` → `"Crypto"`, hint `"USDT, BTC, ETH — billed as the USD equivalent"` → `"USDT · BTC · ETH"`; `src/components/wallet/request-payout-form.tsx:105` `"Bank / UPI (Razorpay)"` → `"Bank / UPI"`. Leave webhook routes, services, and the `RAZORPAY`/`CRYPTO` enum **values** unchanged (internal only). The `src/app/sitemap.ts:40` comment is internal — fine.
- **DB/API impact:** None (display labels only; enum values untouched). **UI impact:** neutral "UPI / Cards" + "Crypto" labels; pairs with O-T1 (USD) so no "Pay in INR".
- **Risk:** Low. **Testing:** no "Razorpay"/"CoinGate" string renders anywhere user-facing (grep `src/components` + `src/app/(checkout|dashboard)`); payment + payout flows still work.
- **Acceptance criteria:** Users never see a payment-processor brand name; only neutral method labels.

---

# Phase 1 — Critical Launch Blockers

> These break the marketplace promise (money can't move, buyers lose listings, dead links, empty
> storefront, mobile CTA glitches, a money-leak bug). Ship Phase 1 before any paid traffic.

### P1-T1 — Payout destination capture (sellers cannot be paid) [Critical · L · High]
> **Updated by O-T1/O-T2:** amounts in **USD**; destinations must be **international** (crypto wallet
> primary; bank/IBAN/SWIFT — UPI only if Razorpay is kept); the payout form is reachable only by a
> **KYC-APPROVED** seller (per O-T2). "Required to receive payouts" is already the KYC promise.
- **Page / Surface:** `/seller/wallet` (request form) · `/admin/payouts` (fulfilment) · onboarding checklist.
- **Exact files:**
  - **New:** `prisma/schema.prisma` → `PayoutAccount` model; `src/server/services/payout-accounts.ts`; `src/server/actions/payout-account.ts`; `src/components/wallet/payout-account-form.tsx`; `src/lib/validators/payout-account.ts`.
  - **Modify:** `src/components/wallet/request-payout-form.tsx` (require a saved destination), `src/server/services/payouts.ts` (snapshot destination onto the `Payout` row at request time), `src/app/admin/payouts/page.tsx` (render masked destination), `src/components/seller/onboarding-checklist.tsx:52-58` (gate "Set payout method" on a real saved account, not the `payoutMethodSet` boolean), `src/app/(dashboard)/seller/wallet/page.tsx`.
- **Components affected:** RequestPayoutForm, OnboardingChecklist, admin PayoutActions, new PayoutAccountForm.
- **Database impact:** New model `PayoutAccount { id, userId, method (RAZORPAY|CRYPTO), holderName, upiVpa?, accountNumberEnc?, ifsc?, cryptoNetwork?, walletAddress?, isDefault, createdAt }`. Add `destinationSnapshot Json?` (or discrete masked columns) to `Payout`. Migration via `DIRECT_URL`. **Encrypt** bank/account numbers at rest (reuse `src/lib/encryption.ts` AES-256-GCM pattern from delivery items).
- **API impact:** New server action `savePayoutAccount` (auth + role SELLER + Zod). `requestPayout` in `payouts.ts` reads the default `PayoutAccount`, throws if none, and snapshots a masked copy onto the `Payout` row inside the existing transaction.
- **UI impact:** Add a "Payout method" card on `/seller/wallet` showing the saved (masked) destination + edit. Request button disabled with a clear CTA when no destination saved. Admin payout row shows masked destination + a copy button.
- **Risk level:** **High** — touches money + PII. Must be server-side, in-transaction, encrypted, audit-logged (`AuditLog`).
- **Testing checklist:**
  - [ ] Zod: UPI VPA regex (`^[\w.-]+@[\w]+$`), IFSC regex (`^[A-Z]{4}0[A-Z0-9]{6}$`), crypto address length/network checks; reject on server even if client passes.
  - [ ] Cannot request payout with no saved destination (server throws, UI blocks).
  - [ ] Destination is snapshotted immutably on the `Payout` at request time (editing the account later doesn't change in-flight payouts).
  - [ ] Account number stored encrypted; never returned in full to client (masked `••••1234`).
  - [ ] Admin sees the destination; `AuditLog` records who viewed/processed.
  - [ ] Onboarding checklist only marks step done when a real account exists.
  - [ ] `typecheck/lint/build` + extend `qa-step14.ts`.
- **Acceptance criteria:** A seller with a completed sale can save a UPI ID, request a withdrawal, and an admin can see exactly where to send the money (masked) — end to end, with encryption + audit.

### P1-T2 — `Buy now` drops `callbackUrl` (logged-out buyer loses the listing) [Critical · S · High]
- **Page / Surface:** PDP `Buy now` → `/checkout` → `/login`.
- **Exact files:** `src/app/(checkout)/checkout/page.tsx` (build the callback), `src/app/(checkout)/layout.tsx:12`, `src/lib/auth.ts:269` (`requireUser`), `src/lib/utils.ts:14` (`safeCallbackUrl`).
- **Components affected:** BuyBox (`buy-box.tsx:54` builds `/checkout?listing=…`), login flow.
- **Database impact:** None.
- **API impact:** `requireUser()` (or the checkout page) must redirect to `/login?callbackUrl=<encoded /checkout?listing=…&qty=…>`; `safeCallbackUrl` must allow `/checkout` (currently falls back to `/dashboard`).
- **UI impact:** After login the buyer lands back on checkout for the exact listing.
- **Risk level:** Low — but `safeCallbackUrl` must keep its open-redirect guard (allow only same-origin internal paths).
- **Testing checklist:**
  - [ ] Logged-out → `Buy now` → login → returns to `/checkout?listing=…&qty=…` (not `/dashboard`).
  - [ ] Open-redirect guard still rejects external/`//evil.com` callbacks.
  - [ ] Works for OAuth + credentials login.
- **Acceptance criteria:** Zero listing context lost across the login wall.

### P1-T3 — Homepage shows no products: add always-on "Fresh listings" rail [Critical · M · High]
- **Page / Surface:** `/` homepage. *(Verification note: tiles read "1 listing" for 4/5 games, not "No listings yet" — inventory is **thin**, and the two paid rails render nothing, so the page still reads pre-launch.)*
- **Exact files:** `src/app/(marketing)/page.tsx:82-93` (insert the rail), **new** `src/components/home/fresh-listings-rail.tsx`, `src/server/services/marketplace.ts:222-249` (**new** `getLatestListings({ limit })` — ACTIVE, `stock>0`, `createdAt desc`, no `minSellerRating`/boost gate), `src/components/marketplace/game-card.tsx:19-22` (soften zero-count copy).
- **Components affected:** new FreshListingsRail (reuse `ListingCard`), GameCard.
- **Database impact:** None (read-only query; ensure index on `Listing(status, createdAt)` exists — it does for the catalog read layer).
- **API impact:** New read service `getLatestListings`; hydrates the same `ListingCardData` shape as the marketplace.
- **UI impact:** A real product rail high on the homepage that never disappears while inventory exists. Keep the **Promoted** rail above it, labelled. Change `formatListingCount` zero-case from "No listings yet" → "Be the first — browse".
- **Risk level:** Low (read-only, ISR-cached at `revalidate=3600`).
- **Testing checklist:**
  - [ ] Rail renders newest ACTIVE in-stock listings regardless of boost.
  - [ ] Falls back to an empty-state CTA (not a blank gap) when truly zero inventory.
  - [ ] No N+1 (single include query); ISR still <100ms TTFB.
  - [ ] Mobile horizontal scroll uses `.no-scrollbar` rail pattern.
- **Acceptance criteria:** A first-time visitor sees real, clickable products above the fold whenever any listing exists. *(Pair with the roadmap's "seed 10 Pokémon GO sellers" to give it real density.)*

### P1-T4 — Fix guides/leaderboard seller links → 404 (`User.id` vs `SellerProfile.id`) [Critical · S · High]
- **Page / Surface:** `/guides/[slug]`, `/leaderboards`, `/leaderboards/[gameSlug]` → `/sellers/[id]`.
- **Exact files:** `src/app/(marketing)/leaderboards/[gameSlug]/page.tsx:63`, `src/app/(marketing)/leaderboards/page.tsx:62` (use `r.sellerId`/`s.sellerId` — already returned by `getGameLeaderboard`, `guides.ts:221-223`), `src/app/(marketing)/guides/[slug]/page.tsx:56` (+ `src/server/services/guides.ts:38` add `author.sellerProfile.id` to the include), `src/server/services/reviews.ts:368` (route resolves `SellerProfile.id`).
- **Components affected:** guide detail, leaderboard rows.
- **Database impact:** None (selection change only).
- **API impact:** `guideInclude` selects `author: { select: { id, name, image, sellerProfile: { select: { id } } } }`; link to `/sellers/${author.sellerProfile?.id}` with a guard (hide link if author has no seller profile).
- **UI impact:** Seller links from community content resolve to real profiles.
- **Risk level:** Low.
- **Testing checklist:**
  - [ ] Every leaderboard + guide-author link returns HTTP 200 (add a Playwright crawl assertion).
  - [ ] Authors without a `SellerProfile` don't render a dead link.
  - [ ] Marketplace/spotlight links (already correct) unaffected.
- **Acceptance criteria:** No 404 on any community→seller link; crawl test green.

### P1-T5 — PDP sticky `Buy now` bar floats 74px above screen edge on mobile [Critical · S · High]
- **Page / Surface:** `/listing/[slug]` (mobile).
- **Exact files:** `src/components/marketplace/buy-box.tsx:213-216` (`bottom-[74px]` → `bottom-0` with safe-area), `src/app/(shop)/listing/[slug]/page.tsx:222` (`pb-32` → `pb-24`). Reference the correct pattern in `checkout-pay-button.tsx:227` (`bottom-0` + `pb-[74px]`).
- **Components affected:** BuyBox sticky bar.
- **Database impact:** None. **API impact:** None.
- **UI impact:** CTA hugs the screen edge (shop layout renders **no** MobileNav, so the 74px offset is dead space).
- **Risk level:** Low — verify no overlap with the PWA install banner (see P5-T2) or support FAB.
- **Testing checklist:** 320 / 375 / 390 / 768px — CTA flush to bottom, no dead gap, `env(safe-area-inset-bottom)` respected on notched devices; desktop unaffected.
- **Acceptance criteria:** Buy CTA sits at the true bottom on all phones with no floating gap.

### P1-T6 — Instant-payout fee not refunded on failed payout (money leak) [Critical · M · Low-rev/High-trust]
- **Page / Surface:** payout failure path (admin/automated).
- **Exact files:** `src/server/services/payouts.ts:402-419` (`markPayoutFailed`), `src/server/services/wallet.ts:55-58` (balance close logic).
- **Components affected:** none (service layer).
- **Database impact:** None (uses existing ledger). **API impact:** in `markPayoutFailed`, in the same CAS-gated transaction, write a compensating `CREDIT/INSTANT_PAYOUT_FEE` to the seller wallet **and** a `DEBIT/FEE` reversal on the platform wallet — **or** explicitly book the retained fee as revenue with an `AuditLog` entry (policy decision; pick one and make the accounting symmetric).
- **UI impact:** Seller's available balance restored on failure.
- **Risk level:** **High** — money path; must be idempotent + CAS-gated like the principal reversal.
- **Testing checklist:**
  - [ ] Failed instant payout restores `availableMinor` exactly (principal + fee).
  - [ ] Platform wallet reconciled (no orphan credit).
  - [ ] Idempotent: replaying the failure event doesn't double-reverse.
  - [ ] Extend `qa-step14.ts` with a fail-after-instant-fee case.
- **Acceptance criteria:** No silent fee retention; ledger reconciles to zero discrepancy on failed instant payouts.

### P1-T7 — Broken footer link `/disputes` (no such route) [Critical · S · Medium]
- **Page / Surface:** site-wide footer.
- **Exact files:** `src/config/nav.ts:99` (`{ title: "Open a dispute", href: "/disputes" }`).
- **Database impact:** None. **API impact:** None.
- **UI impact:** Repoint to the real dispute entry (disputes open from `/orders/[id]`); change to `{ title: "How disputes work", href: "/trust-safety#disputes" }` or `/help`, or build a `/disputes` explainer page.
- **Risk level:** Low.
- **Testing checklist:** Footer link returns 200; crawl test covers all `nav.ts` hrefs.
- **Acceptance criteria:** No 404 from any footer/nav link (also fixes a crawl-budget SEO leak).

---

# Phase 2 — Trust Improvements

> Trust is *told* but not *shown*. Convert real data into visible proof; make protection bold at the
> decision point; reassure the seller side; surface the gamification you already built.

### P2-T1 — Real (non-fabricated) social proof from existing data [Critical · M · High]
- **Page / Surface:** `/` , `/marketplace`, `/listing/[slug]`.
- **Exact files:** `src/components/home/home-hero.tsx:13-16,44-52`, `src/components/home/home-reviews.tsx:5-10` (re-activate from real `Review` rows), `src/components/layout/trust-ribbon.tsx:10-26`, `src/app/(shop)/listing/[slug]/page.tsx` (sold count + viewers), `src/components/marketplace/seller-trust-panel.tsx:128-134`, **new** `src/components/home/recent-activity-rail.tsx`, `src/server/services/marketplace.ts` (counts + recent-completed query).
- **Components affected:** HomeHero, HomeReviews, TrustRibbon, SellerTrustPanel, new RecentActivityRail.
- **Database impact:** None (read-only COUNT/aggregate over `Order`, `Review`, `Listing.viewCount`). Add index on `Order(status, updatedAt)` if not present.
- **API impact:** New reads: `getPlatformStats()` (completed orders, verified sellers, active listings, avg rating), `getRecentCompletedOrders(limit)` (anonymized), per-listing completed-order count. **Gate every counter behind a minimum threshold so it never shows "0".**
- **UI impact:** Honest stats band ("1,200+ escrow-protected orders · 40 verified sellers"), a "Recently sold on GETX" anonymized rail, "Sold N times" + "N viewed this week" on PDP, re-enabled real reviews on home.
- **Risk level:** Low — **must stay truthful** (no fabricated numbers; this is a documented platform principle). Cache stats (ISR / 10-min `revalidate`).
- **Testing checklist:**
  - [ ] Every number traces to a real DB row; thresholds hide low/zero counts.
  - [ ] Recent-activity rail anonymizes buyer identity (no PII).
  - [ ] PDP sold/viewers render only above threshold.
  - [ ] No layout shift (reserve space / skeleton).
- **Acceptance criteria:** Above-the-fold and PDP carry at least one *real* proof signal once thresholds are crossed, with zero fabrication.

### P2-T2 — Money-back guarantee seal at the buy moment [High · S · High]
- **Page / Surface:** `/listing/[slug]` (BuyBox), `/checkout`.
- **Exact files:** **new** `src/components/shared/guarantee-seal.tsx`, `src/components/marketplace/buy-box.tsx:207`, `src/components/checkout/checkout-trust-badges.tsx:17-30`, `src/components/shared/escrow-protection-panel.tsx:44-64`.
- **Components affected:** BuyBox, CheckoutTrustBadges, new GuaranteeSeal.
- **Database impact:** None. **API impact:** None.
- **UI impact:** A success-tinted shield seal ("GETX 100% Money-Back Guarantee — full refund incl. fees if not as described, decided in 48h") placed *directly adjacent* to the Buy/Pay button — not as one of N equal grey pills. (Hierarchy, not new copy.)
- **Risk level:** Low. Use the new `--success` tints from `COLOR_SYSTEM_REDESIGN.md`.
- **Testing checklist:** Seal visible without scrolling on PDP + checkout, mobile + desktop; a11y contrast ≥ 4.5:1; doesn't crowd the CTA tap target.
- **Acceptance criteria:** The strongest objection-killer is the most prominent trust element at the click.

### P2-T3 — Seller-side protection messaging (chargeback immunity is a real wedge) [Critical · M · High]
- **Page / Surface:** `/` (Seller CTA), `/become-seller`, `/seller-guide`, `/orders/[id]` (seller view).
- **Exact files:** `src/components/home/seller-cta.tsx:23-37`, `src/app/(marketing)/seller-guide/page.tsx`, `src/app/(dashboard)/become-seller/page.tsx`, **new** `src/components/orders/seller-protection-panel.tsx` (mirror the buyer escrow panel for the seller on the deliver step).
- **Components affected:** SellerCta, become-seller page, new SellerProtectionPanel.
- **Database impact:** None. **API impact:** None.
- **UI impact:** "✓ Guaranteed payout once buyer confirms or 3 days pass · ✓ No chargebacks (crypto/UPI settled) · ✓ Fraud-screened buyers · ✓ Dispute Judge protects honest sellers." Pull chargeback-immunity forward as a headline differentiator (real: no Stripe).
- **Risk level:** Low.
- **Testing checklist:** Copy is accurate vs actual escrow/payment behaviour; renders on all four surfaces; mobile legible.
- **Acceptance criteria:** A prospective seller sees their #1 fear (getting scammed / not paid) explicitly addressed before listing.

### P2-T4 — Surface gamification (levels, badges, leaderboards) in the buyer path [High · M · High]
- **Page / Surface:** `/marketplace` cards, `/listing/[slug]`, header.
- **Exact files:** `src/components/marketplace/listing-card.tsx:167-197` (add `SellerLevelBadge size="xs"`), `src/components/marketplace/seller-trust-panel.tsx:57` (top 1–2 community badges + level tooltip), `src/components/layout/marketplace-header.tsx` (add a "Top sellers" entry → `/leaderboards`), `src/components/shared/seller-level-badge.tsx:10-29` (add a popover explainer).
- **Components affected:** ListingCard, SellerTrustPanel, MarketplaceHeader, SellerLevelBadge.
- **Database impact:** None (data exists: `trust-score.ts`, `badges.ts`). **API impact:** None (already hydrated on cards/panels).
- **UI impact:** Buyers see Gold/Platinum/Elite at scan time, badges on the PDP with a "why this matters" tooltip, and a discoverable "Top sellers" board.
- **Risk level:** Low.
- **Testing checklist:** Level badge renders on cards without breaking layout; tooltip keyboard-accessible; leaderboard entry visible on shop chrome.
- **Acceptance criteria:** The fully-built gamification system is visible exactly where purchase decisions happen.

### P2-T5 — Honest scarcity & urgency signals [High · M · Medium]
- **Page / Surface:** `/listing/[slug]`, `/marketplace` cards.
- **Exact files:** `src/components/marketplace/buy-box.tsx:34-35,83-95`, `src/components/marketplace/listing-card.tsx`, `src/server/services/liquidity.ts:154-163` (expose `viewCount`).
- **Components affected:** BuyBox, ListingCard.
- **Database impact:** None (reuse `viewCount` + completed-order counts + existing MarketPulse/demand data). **API impact:** read-only thresholded signals.
- **UI impact:** "One-of-a-kind — only 1 available" for unique (stock=1) ACCOUNT listings; "Popular — 12 viewed this week" / "Selling fast" gated by real thresholds; boost-window countdown on promoted listings.
- **Risk level:** Low — **only render when the real number justifies it** (never fabricate).
- **Testing checklist:** Signals appear only above thresholds; unique-account badge only when stock=1; no fake timers.
- **Acceptance criteria:** Every urgency cue is backed by a real number.

---

# Phase 3 — Buyer Experience Improvements

> Build the retention/discovery loop that lets an interested-but-not-ready buyer come back.

### P3-T1 — Wishlist / Favourites (+ price-drop / restock alerts foundation) [Critical · M→L · High]
- **Page / Surface:** `/marketplace`, `/listing/[slug]`, `/dashboard/wishlist` (new).
- **Exact files:** `prisma/schema.prisma` (new `Wishlist`), **new** `src/server/services/wishlist.ts`, `src/server/actions/wishlist.ts`, `src/components/marketplace/wishlist-button.tsx`, `src/app/(dashboard)/wishlist/page.tsx`; modify `src/components/marketplace/listing-card.tsx:46-201` (heart, top-right of cover, `relative z-10`), `src/components/marketplace/buy-box.tsx:188-205`.
- **Components affected:** ListingCard, BuyBox, new WishlistButton, new wishlist page (reuse `ListingGrid`).
- **Database impact:** New model `Wishlist { id, userId, listingId, createdAt, @@unique([userId, listingId]) }` + indexes. Migration.
- **API impact:** `toggleWishlist(listingId)` server action — auth + rate-limit (userId-keyed, per the established pattern). Optimistic UI with `clientId`.
- **UI impact:** Heart toggle on cards + PDP; `/dashboard/wishlist` list; for logged-out, the heart opens a "Sign up to save" modal (ties to P6-T2).
- **Risk level:** Low-Medium.
- **Testing checklist:**
  - [ ] Auth required server-side; rate-limited; `@@unique` prevents dupes (handle P2002 outside tx).
  - [ ] Optimistic toggle reconciles on failure.
  - [ ] Wishlist page paginates, shows removed/sold listings gracefully.
  - [ ] Anonymous heart → signup modal, not a silent no-op.
- **Acceptance criteria:** A buyer can save/unsave any listing and see it in their dashboard; foundation ready for alert jobs (P3-T3).

### P3-T2 — Recently-viewed history [High · M · Medium]
- **Page / Surface:** `/`, `/marketplace`, `/listing/[slug]`.
- **Exact files:** `src/server/services/liquidity.ts:154-163` (extend `recordListingView`), **new** `src/components/marketplace/recently-viewed-rail.tsx`, `src/app/offline/page.tsx:26` (make the copy true).
- **Components affected:** new RecentlyViewedRail.
- **Database impact:** Optional `RecentlyViewed { userId, listingId, viewedAt, @@unique }` for logged-in; cookie/localStorage for anon (last ~20 IDs).
- **API impact:** Append-on-view (dedupe, cap at 20); read hydrates card shape.
- **UI impact:** "Recently viewed" rail across home/marketplace/PDP; fulfils the offline-page promise.
- **Risk level:** Low.
- **Testing checklist:** Anon (cookie) + logged-in (DB) paths; dedupe + cap; no PII leak; rail hidden when empty.
- **Acceptance criteria:** Buyers can return to recently-seen candidates; offline copy matches reality.

### P3-T3 — Saved searches + price-drop / restock alerts [High · L · High]
- **Page / Surface:** `/marketplace`, `/games/[slug]/[category]`.
- **Exact files:** `prisma/schema.prisma` (new `SavedSearch`), **new** `src/server/services/saved-search.ts`, `src/app/api/cron/saved-search-alerts/route.ts`, `src/components/marketplace/save-search-button.tsx`; modify `src/components/marketplace/marketplace-filters.tsx:158-186` (the full filter object is already here).
- **Components affected:** MarketplaceFilters, new SaveSearchButton.
- **Database impact:** New model `SavedSearch { id, userId, filtersJson, lastNotifiedAt, createdAt }`. Wishlist (P3-T1) powers price-drop alerts.
- **API impact:** Daily cron matches new ACTIVE listings against saved searches + wishlist price changes → fires the **existing** notification + Resend email pipeline. Add to `vercel.json` crons (note Hobby 2-cron cap — may need to fold into an existing daily cron).
- **UI impact:** "Save this search / Notify me" on the filter bar; managed in dashboard.
- **Risk level:** Medium — email volume; respect notification preferences + min interval (`lastNotifiedAt`).
- **Testing checklist:** Match logic correct; no duplicate/spam emails; honors email prefs; cron idempotent; Hobby cron budget respected.
- **Acceptance criteria:** A buyer subscribes to a query and gets one timely alert when matching supply appears.

### P3-T4 — Search autocomplete with Postgres fallback (kill the dead search) [High · M · High]
- **Page / Surface:** `/marketplace`, `/` hero, `/dashboard` topbar.
- **Exact files:** `src/components/marketplace/instant-search-bar.tsx:33` (fall back to Postgres instead of rendering `null`), **new** `src/app/api/search/suggest/route.ts` (title/game prefix + `pg_trgm`), `src/components/layout/app-topbar.tsx:35-43` (remove/replace the `disabled` "Search coming soon" input).
- **Components affected:** InstantSearchBar, AppTopbar.
- **Database impact:** Add `pg_trgm` extension + GIN index on `Listing.title` (migration).
- **API impact:** New lightweight suggest endpoint (debounced, top 5), zero external deps; Algolia path still preferred when keys exist.
- **UI impact:** Working autocomplete in prod everywhere; the visibly-broken dashboard search is fixed or removed.
- **Risk level:** Low-Medium (index migration).
- **Testing checklist:** Suggestions return in <150ms; typo tolerance via trigram; no results → graceful; dashboard search no longer disabled.
- **Acceptance criteria:** Autocomplete works without Algolia keys; no dead search control anywhere.

### P3-T5 — Account / profile settings page [High · L · Medium]
- **Page / Surface:** `/settings` (new), UserMenu.
- **Exact files:** **new** `src/app/(dashboard)/settings/page.tsx`, `src/server/actions/account.ts` (`updateProfile`, `changePassword`, `updateEmail`, `updateAvatar`); modify `src/components/layout/user-menu.tsx:44-89` (add Settings entry).
- **Components affected:** UserMenu, new settings forms.
- **Database impact:** None new (uses `User`); reuse R2 presign for avatar.
- **API impact:** Server actions with auth + Zod; `changePassword` must call `invalidateUserSessions` (sessionVersion bump, per Step 32); email change re-verifies.
- **UI impact:** In-app profile, password, email, avatar management + link from UserMenu.
- **Risk level:** Medium — password/email are security-sensitive (rate-limit, re-auth on password change).
- **Testing checklist:** Password change invalidates other sessions; email change requires verification; avatar upload via private→public R2 path; rate-limited.
- **Acceptance criteria:** A logged-in user can update name/email/avatar/password without logging out.

### P3-T6 — Post-purchase cross-sell + repeat-purchase loop [High · M · High]
- **Page / Surface:** `/orders/[id]` (COMPLETED).
- **Exact files:** `src/app/(dashboard)/orders/[id]/page.tsx:284-302`; reuse `getMoreFromSeller`/`getMoreInCategory` (already in `marketplace.ts`).
- **Components affected:** order detail page.
- **Database impact:** None. **API impact:** reuse existing PDP related-rail reads; trigger a post-completion "buy again" email via the notification pipeline.
- **UI impact:** "More from {seller}", "More {game} listings", "You earned N reward points → keep shopping" on the completion screen.
- **Risk level:** Low.
- **Testing checklist:** Rails render on COMPLETED only; loyalty earned shown accurately; email fires once.
- **Acceptance criteria:** The highest-trust moment (a safe completed order) drives a next action instead of a dead end.

---

# Phase 4 — Seller Experience Improvements

> Make sellers feel like CEOs: show progression, enforce delivery, protect them, unblock day-one growth.

### P4-T1 — Render LevelProgressPanel on the seller hub [High · S · Medium]
- **Page / Surface:** `/seller`.
- **Exact files:** `src/app/(dashboard)/seller/page.tsx:126-165` (mount it below the KPI cards); component already exists: `src/components/seller/level-progress-panel.tsx:14-89`.
- **Components affected:** seller hub, LevelProgressPanel.
- **Database impact:** None (hub already fetches trustScore/totalSales/kycStatus). **API impact:** pass existing data as props.
- **UI impact:** Current level, perks, and an itemized "X sales to GOLD" next-level checklist on every seller visit.
- **Risk level:** Low.
- **Testing checklist:** Renders for all levels; "next level" math correct; no extra queries.
- **Acceptance criteria:** Every seller sees their progression + how to unlock lower fees/faster payouts.

### P4-T2 — Seller delivery SLA / countdown on PAID orders [High · M · Medium]
- **Page / Surface:** `/seller/orders`, `/orders/[id]` (seller view).
- **Exact files:** `prisma/schema.prisma` (add `deliverByAt` to `Order`), `src/server/services/orders.ts:329-348` (set `deliverByAt = paidAt + 24–48h` by `deliveryType`), `src/app/(dashboard)/seller/orders/page.tsx:73-96`, `src/app/(dashboard)/orders/[id]/page.tsx:223-225`, optionally the auto-cancel cron.
- **Components affected:** seller orders list/detail, DeliverForm.
- **Database impact:** New nullable `Order.deliverByAt` (migration; backfill in-flight PAID orders).
- **API impact:** Set deadline on PAID transition; optional trust-penalty / auto-cancel+refund on breach.
- **UI impact:** Visible "Deliver within Xh" countdown on PAID orders.
- **Risk level:** Medium (touches the escrow state machine — keep transitions explicit + tested).
- **Testing checklist:** Deadline set on PAID; countdown accurate across timezones; breach path (penalty/refund) tested; existing escrow tests still green (`qa-step10.ts`).
- **Acceptance criteria:** Sellers face a visible delivery clock; the "fast" brand promise is enforceable.

### P4-T3 — Notification bell in the dashboard chrome [High · S · Medium]
- *(Shared with P6-T1 — implement once; it serves both seller + buyer dashboards.)* See P6-T1.

### P4-T4 — Day-one seller growth: direct-pay for Pro/Boost/Bump/Spotlight [Critical · L · High]
- *(Cross-listed in Phase 10 as the primary revenue unlock — see P10-T1.)* Summary: new sellers have ₹0 available and are told "complete a sale first", so the platform's own monetization is unreachable by the cohort most likely to pay. Add a direct CoinGate/Razorpay pay path (rails already exist) or a free first boost / 14-day Pro trial.

---

# Phase 5 — Mobile Improvements

> Mobile-first build with no horizontal overflow, but several fixed-bottom elements stack/overlap.

### P5-T1 — (done in P1-T5) Anchor PDP sticky Buy bar to `bottom-0`.
See **P1-T5** (promoted to Phase 1 as a conversion blocker).

### P5-T2 — PWA install banner can cover the Buy/Pay CTA + bottom nav [High · S · Medium]
- **Page / Surface:** `/listing/[slug]`, `/checkout` (first session).
- **Exact files:** `src/components/pwa/install-banner.tsx:81-83` (`fixed inset-x-0 bottom-0 z-[60]`), `src/app/layout.tsx:113`.
- **Database impact:** None. **API impact:** None.
- **UI impact:** Suppress the banner on checkout/listing routes, or offset bottom-fixed CTAs up by its height while visible.
- **Risk level:** Low. **Testing:** banner never overlaps Buy/Pay or MobileNav (z-index audit: install z-60 vs MobileNav z-55 vs pay z-55 vs BuyBox z-40); dismiss persists.
- **Acceptance criteria:** First-session install nag never blocks a purchase CTA.

### P5-T3 — AI Support FAB collides with the dashboard bottom nav [High · S · Low]
- **Page / Surface:** `/dashboard`, `/seller`, `/admin` (mobile).
- **Exact files:** `src/components/chat/support-widget.tsx:196` (`right-4 bottom-4`), ref `src/components/layout/mobile-nav.tsx:67` (74px nav).
- **UI impact:** Raise the FAB on small screens: `bottom-[calc(74px+env(safe-area-inset-bottom)+12px)]`, keep `sm:bottom-6`.
- **Risk level:** Low. **Testing:** FAB clears the last nav tab at 320/375/390px; desktop unchanged.
- **Acceptance criteria:** FAB and bottom-nav tabs are both fully tappable.

### P5-T4 — Tap targets: default controls below 44px [High · S · Medium]
- *(Shared with P7-T5.)* `Button` default `h-8`/lg `h-9` and Input/Select `h-8` fall under the 44px tap minimum; pages override ad-hoc with `h-10`. Bump defaults — see **P7-T5**.

### P5-T5 — Mobile trust/nav/search parity [Medium · M · Medium]
- **Page / Surface:** shop + dashboard mobile chrome.
- **Exact files:** `src/components/layout/marketplace-header.tsx`, `src/components/layout/app-topbar.tsx`, `src/components/layout/mobile-nav.tsx`.
- **UI impact:** Ensure the notification bell (P6-T1), "Create account" CTA (P6-T2), and working search (P3-T4) are present and legible on small screens across all three headers.
- **Risk level:** Low. **Testing:** 320–768px sweep on every header; no overflow; tap targets ≥44px.
- **Acceptance criteria:** Header capabilities are consistent across marketing/shop/dashboard on mobile.

---

# Phase 6 — Conversion Improvements

> The biggest, cheapest wins: **un-hide features that already exist** + close the acquisition funnel.

### P6-T1 — Expose NotificationBell on shop + dashboard headers [Critical · S · High]
- **Page / Surface:** `/marketplace`, `/dashboard`, `/seller/*`, `/orders`, `/admin`.
- **Exact files:** `src/components/layout/marketplace-header.tsx:43-61`, `src/components/layout/app-topbar.tsx:45-57`; lift the data fetch from `src/components/layout/site-header.tsx:30-34,75-80` (`countUnreadNotifications` + `getNotifications`) into a shared header helper; component exists: `src/components/shared/notification-bell.tsx`.
- **Components affected:** MarketplaceHeader, AppTopbar, SiteHeader (shared helper).
- **Database impact:** None. **API impact:** reuse existing reads; one shared loader.
- **UI impact:** Logged-in users see order/payout/dispute/restock alerts where they actually spend time.
- **Risk level:** Low. **Watch:** lazy-load the socket so it doesn't bloat guest bundles (see P8-T1).
- **Testing checklist:** Bell + unread badge render on all three headers; realtime updates; mark-read works; settings link reachable.
- **Acceptance criteria:** A fully-built retention asset is visible on the two highest-traffic logged-in surfaces.

### P6-T2 — Acquisition funnel: OAuth keys + "Create account" CTA + signup nudges [High · M · High]
- **Page / Surface:** `/marketplace`, `/listing/[slug]`, `/login`, `/register`.
- **Exact files:** `src/components/layout/marketplace-header.tsx:53-60` (add "Create account"), `src/components/auth/oauth-buttons.tsx:51-53` (renders nothing without keys → **set Google/Discord OAuth keys in prod**), `src/app/(auth)/register/page.tsx:24-37` (+ trust/value rail), wishlist heart → "Sign up to save" modal (P3-T1).
- **Database impact:** None. **API impact:** OAuth provider config (env).
- **UI impact:** One-click signup live; anonymous browsers get a low-friction reason to register; optional dismissible value-prop bar.
- **Risk level:** Low (config + UI). **Testing:** Google/Discord signup works in prod; "Create account" visible; modal converts the wishlist gesture.
- **Acceptance criteria:** Anonymous high-traffic pages actively grow the remarketable base.

### P6-T3 — Abandoned-checkout / unpaid-order recovery [High · M · High]
- **Page / Surface:** `/checkout`, `/orders`.
- **Exact files:** **new** `src/app/api/cron/order-recovery/route.ts`, `src/app/(dashboard)/orders/page.tsx` (prominent "Complete payment" CTA on AWAITING_PAYMENT), ref `src/components/checkout/checkout-pay-button.tsx:118-155`.
- **Database impact:** None (query AWAITING_PAYMENT past N minutes). **API impact:** cron fires the existing notification + email ("Finish your order — your price is reserved") with a deep link; respect Hobby cron cap.
- **UI impact:** Unpaid orders surfaced with a recovery CTA; crypto orders especially.
- **Risk level:** Medium (don't spam; one nudge per order). **Testing:** recovery fires once; deep link works; respects order expiry.
- **Acceptance criteria:** Buyers who hit a payment hiccup are brought back.

### P6-T4 — Surface loyalty + referral at the right moments [Medium · S · Medium]
- **Page / Surface:** `/orders/[id]` (completion), `/dashboard`, checkout.
- **Exact files:** `src/app/(dashboard)/orders/[id]/page.tsx` (loyalty-earned banner), `/loyalty` + `/referrals` entry points in UserMenu/dashboard, checkout loyalty toggle (already exists).
- **Database impact:** None. **API impact:** None (loyalty/referral already built).
- **UI impact:** Earned-points celebration + referral prompt at the trust peak.
- **Risk level:** Low. **Testing:** points shown accurately; referral link generates.
- **Acceptance criteria:** Built loyalty/referral systems are visible at high-intent moments.

### P6-T5 — Top-50 CRO backlog (tracked) [reference]
The competitor-CRO audit produced a ranked Top-50 (signups, seller registrations, orders, repeat, AOV).
Items already captured above as tasks; the remainder (express pay, "price reserved 15 min", desktop
sticky buy CTA, seller earnings calculator, follow-seller alerts, Shield pre-select, bundle discounts)
are tracked in **Phase 10** and as a backlog appendix. Sequence: **(1) un-hide built features → (2) build
the retention loop → (3) carts/price-history/compare.**

---

# Phase 7 — Premium UI Upgrade

> Root cause of "feels flat / less trustworthy": one card surface, no elevation scale, one overloaded
> accent, off-token colors. Full spec in **`COLOR_SYSTEM_REDESIGN.md`**; build order below.

### P7-T1 — Elevation scale + shadow tokens (the flatness fix) [Critical · L · High]
- **Exact files:** `src/app/globals.css:80-91` (add `--surface-0..3` + `--shadow-sm/md/lg`; differentiate `secondary`/`muted`/`accent` which are all `#1b1e25` today), `src/components/ui/card.tsx:15`.
- **Database/API impact:** None. **UI impact:** cards = surface-2, dialogs = surface-3, alternating section bgs; depth without leaving dark.
- **Risk level:** Medium (site-wide visual change → screenshot diff). **Testing:** visual regression on home/PLP/PDP/checkout/dashboard; contrast preserved.
- **Acceptance criteria:** Clear visual hierarchy/elevation; the owner's "flat" complaint resolved. *(See COLOR doc §Backgrounds.)*

### P7-T2 — Unify trust-score colors (two conflicting systems) [Critical · M · High]
- **Exact files:** `src/lib/trust.ts:12-16` (`trustTone`, 90/70 tokens) vs `src/components/shared/trust-score-pill.tsx:10-15` (off-token emerald/yellow/orange/red 80/60/40) — make **one** helper feed pill + card + panel; add a `--trust` green with bg/border tints; bolden the escrow panel (`escrow-protection-panel.tsx:71` `bg-primary/8` → success-tinted).
- **UI impact:** One score → one color everywhere. **Risk:** Low. **Testing:** same score renders identically on card, pill, panel.
- **Acceptance criteria:** No contradictory trust colors; escrow panel reads as "safe" (green), not faint blue.

### P7-T3 — Off-palette color cleanup → tokens + ESLint guard [Critical · M · Medium]
- **Exact files:** `SELLER_LEVELS` (amber/slate/yellow/cyan), `src/app/admin/fraud/page.tsx:19` (purple), `funnel-chart.tsx:21-27`, `order-status-badge.tsx:16-17` — ~25 off-token hits in 13 files. Add semantic tier/status tokens + a `statusTone()` helper; add an ESLint rule banning raw hex/Tailwind color literals in `src/components`.
- **UI impact:** Consistent palette. **Risk:** Low. **Testing:** grep finds zero raw color literals post-change; lint rule fails on reintroduction.
- **Acceptance criteria:** All status/tier colors flow from tokens; single-accent discipline enforced.

### P7-T4 — One card system + badge variants [High · M · Medium]
- **Exact files:** `src/components/ui/card.tsx` (ring-1/rounded-xl) vs page-level `border`/`rounded-lg` cards; consolidate to one. Adopt the unused `src/components/ui/badge.tsx` variants to replace the 7 ad-hoc status pills.
- **UI impact:** Consistent cards + badges. **Risk:** Low-Medium (broad refactor). **Testing:** visual diff; all cards/badges use the shared primitives.
- **Acceptance criteria:** One card pattern, one badge system across the app.

### P7-T5 — Bump default control sizes to ≥44px tap target [High · S · Medium]
- **Exact files:** `src/components/ui/button.tsx:24-29` (default `h-8`→`h-10`, lg `h-9`→`h-11`), `src/components/ui/input.tsx`, `native-select.tsx` (`h-8`→`h-10`).
- **UI impact:** Removes ad-hoc `h-10` overrides; meets WCAG/mobile tap minimums. **Risk:** Medium (sizing ripples) — audit dense admin tables. **Testing:** controls ≥44px on touch; no layout breakage in admin/forms.
- **Acceptance criteria:** Default controls meet tap-target minimums without per-page overrides.

---

# Phase 8 — Performance Improvements

> Above-average baseline (RSC-first, indexed reads, thoughtful ISR, AVIF/WebP images). Fix bundle
> discipline on guest pages + one O(n) cron.

### P8-T1 — Lazy-load socket.io-client off guest/marketing bundles [High · S · Medium]
- **Exact files:** `src/hooks/useSocket.ts:4` (replace top-level `import { io }` with `const { io } = await import('socket.io-client')` inside the effect), ref `src/components/shared/notification-bell.tsx:6,43`, `src/components/layout/site-header.tsx:11,75`.
- **Impact:** ~40–55KB gzipped leaves the homepage + all marketing first-load JS (guests never use the socket). **Risk:** Low (already async). **Testing:** `npm run analyze` confirms socket.io-client out of marketing/home chunk; bell still connects for authed users.
- **Acceptance criteria:** socket.io-client absent from guest first-load; CWV (INP/TBT) improves on the funnel.

### P8-T2 — Enable `optimizePackageImports` [High · S · Medium]
- **Exact files:** `next.config.ts:62` → `experimental: { optimizePackageImports: ['lucide-react','recharts','posthog-js','date-fns'] }`.
- **Impact:** barrel tree-shaking for icons/charts on every route. **Risk:** Low. **Testing:** `npm run analyze` before/after shows icon/chart chunk shrink; build green.
- **Acceptance criteria:** Smaller first-load JS site-wide from a one-line, low-risk change.

### P8-T3 — Batch the trust-score cron (≈600 serial Neon round-trips) [High · M · Medium]
- **Exact files:** `src/app/api/cron/trust-score/route.ts:46-55`, `src/server/services/trust-score.ts:295-336,392`.
- **Impact:** process sellers in chunks of ~10 via `Promise.all`; replace in-JS status counting with `groupBy(status)`; longer-term a single set-based reply-time SQL pass. **Risk:** Medium (respect pooled connection limit). **Testing:** wall-clock drops ~10×; results identical to serial; stays well under `maxDuration=300s`.
- **Acceptance criteria:** Trust recompute no longer risks timeout as sellers grow.

### P8-T4 — Remove double `auth()` on marketing TTFB + split recharts/markdown [Medium · S · Low]
- **Exact files:** marketing layout/header `auth()` call sites; chart pages (`revenue-chart.tsx`, `funnel-chart.tsx`) + markdown via `next/dynamic`.
- **Impact:** lower marketing TTFB; charts/markdown off the critical path. **Risk:** Low. **Testing:** single `auth()` per request; charts lazy-load.
- **Acceptance criteria:** No redundant session reads; heavy libs code-split.

---

# Phase 9 — SEO Improvements

> Strong technical foundation (per-route metadata, JSON-LD, faceted noindex, sitemap). Close the leaks.

### P9-T1 — Meaningful `alt` text on listing/game card + banner images [High · S · Medium]
- **Exact files:** `src/components/marketplace/listing-card.tsx:79` (`alt={title}`), `src/components/marketplace/game-card.tsx:47` (`alt={\`${game.name} listings\`}`), `src/app/(shop)/games/[slug]/page.tsx:188` (`alt={\`${game.name} banner\`}`).
- **Impact:** unlocks Google Image traffic on a visual vertical (currently `alt=""` everywhere). **Risk:** Low — verify with axe that accessible names don't duplicate the overlay link. **Testing:** axe a11y clean; images carry descriptive alt.
- **Acceptance criteria:** Content images are indexable without breaking the overlay-link a11y pattern.

### P9-T2 — Homepage metadata + self-canonical + WebSite/SearchAction schema [High · S · Medium]
- **Exact files:** `src/app/(marketing)/page.tsx:43` (add `export const metadata` with `alternates:{canonical:'/'}` + keyword title), **new** `src/components/seo/website-jsonld.tsx` (WebSite + `potentialAction: SearchAction` → `/marketplace?q={search_term_string}`), rendered in `src/app/layout.tsx` beside `OrganizationJsonLd`.
- **Impact:** Sitelinks Search Box + protected branded/head-term ranking; no utm/ref dilution. **Risk:** Low. **Testing:** Rich Results test passes WebSite+SearchAction; canonical present.
- **Acceptance criteria:** Homepage has its own canonical + keyword title + SearchAction.

### P9-T3 — Community SEO: guides ISR + sitemap + Article schema + canonical/OG [High · M · Medium]
- **Exact files:** `src/app/(marketing)/guides/[slug]/page.tsx:12` (drop `force-dynamic` → `revalidate=3600`), `:20` (add canonical + openGraph/twitter + Article/BlogPosting JSON-LD), `src/app/(marketing)/guides/page.tsx:7` + both leaderboard pages (canonical + Breadcrumbs), `src/app/sitemap.ts:23-122` (emit published guides + leaderboard URLs). Ensure unpublished guides return 404 (not an indexable thin page).
- **Impact:** the long-tail content moat becomes discoverable + rich-result eligible. **Risk:** Low-Medium. **Testing:** guides in sitemap; Article schema valid; unpublished → 404; TTFB drops with ISR.
- **Acceptance criteria:** Guides/leaderboards are crawlable, cached, schema-rich, and in the sitemap. *(Pairs with P1-T4 link fix.)*

---

# Phase 10 — Revenue Optimization

### P10-T1 — Day-one seller monetization: direct-pay for Pro/Boost/Bump/Spotlight [Critical · L · High]
> **Updated by O-T5:** the **listing-cap** portion is REMOVED (listings are unlimited). Pro now sells
> commission discount + badge + priority support + analytics only. Direct-pay (below) still applies to
> Pro/Boost/Bump/Spotlight, in **USD** (O-T1), and only for KYC-approved sellers (O-T2).
- **Page / Surface:** `/seller/subscription`, `/seller/listings`.
- **Exact files:** `src/server/services/monetization.ts:48-69` (the wallet-only debit + "complete a sale first" dead end), `src/components/seller/boost-listing-button.tsx:30-41`, `src/components/seller/subscribe-pro-button.tsx:24-34`, `src/app/(dashboard)/seller/subscription/page.tsx:96-101`.
- **Database impact:** Possibly a `MonetizationPurchase`/order-type record for external payments. **API impact:** add a CoinGate/Razorpay direct-pay path (rails already exist for checkout) for Pro/Boost/Bump/Spotlight; alternatively a free first boost / 14-day Pro trial to break the deadlock.
- **UI impact:** New sellers can pay instantly to promote their first listing; empty-balance copy points to a real top-up, not a dead end.
- **Risk level:** Medium-High (payments). **Testing:** direct-pay → boost activates idempotently; webhook verified; refund path; no double-charge.
- **Acceptance criteria:** A day-one seller can buy visibility with real money; primary seller-side revenue is reachable by the cohort most likely to pay.

### P10-T2 — AOV levers (Shield REMOVED — see O-T16) [Medium · M · Medium]
> **Updated by O-T16:** the Shield paid add-on is removed (legal risk). Money-back is universal & free. AOV now comes from non-protection levers only.
- **Exact files:** checkout, CURRENCY listing flows, `/orders`, seller-follow.
- **Impact:** bundle/quantity-discount hints for CURRENCY listings, "buy again" on `/orders`, follow-seller new-listing alerts. **Risk:** Low. **Testing:** discounts compute in minor units (round-half-up); no fee-model regression.
- **Acceptance criteria:** Higher AOV with no paid-protection upsell; escrow reconciliation untouched.

### P10-T3 — Boost/Spotlight discoverability + featured supply [Medium · M · Medium]
- **Exact files:** `src/components/home/featured-listings-rail.tsx`, `src/components/home/seller-spotlight.tsx`, `/seller/listings` boost CTAs.
- **Impact:** once direct-pay (P10-T1) exists, drive boost/spotlight adoption so the paid rails (currently empty) actually populate — closing the loop with P1-T3. **Risk:** Low. **Testing:** boosted listings appear in the labelled Promoted rail; cap `maxFeaturedPerPage` respected.
- **Acceptance criteria:** Paid placement is both purchasable (P10-T1) and visibly rewarded.

---

## Appendix A — Effort & dependency map (build order)

```
Phase 1 (blockers)         P1-T1 → P1-T2 → P1-T4 → P1-T7 → P1-T5 → P1-T6 → P1-T3
Phase 7 tokens FIRST-ish   P7-T1 (elevation) unblocks P2 trust visuals + P7-T2/T3/T4
Phase 2 (trust)            P2-T1 → P2-T2 → P2-T3 → P2-T4 → P2-T5
Phase 3 (buyer loop)       P3-T1 → P3-T2 → P3-T4 → P3-T3 → P3-T6 → P3-T5
Phase 6 (un-hide)          P6-T1 → P6-T2 → P6-T3 → P6-T4   (P6-T1 is a same-day win)
Phase 4 (seller)           P4-T1 → P4-T2 → (P4-T4=P10-T1)
Phase 5 (mobile)           P5-T2 → P5-T3 → P5-T4(=P7-T5) → P5-T5
Phase 8 (perf)             P8-T1 → P8-T2 → P8-T3 → P8-T4
Phase 9 (seo)              P9-T1 → P9-T2 → P9-T3
Phase 10 (revenue)         P10-T1 → P10-T3 → P10-T2
```

**Note on quick wins:** P6-T1 (bell exposure), P6-T2 (OAuth keys), P9-T1 (alt text), P8-T2
(`optimizePackageImports`), P1-T7 (footer link) are all **S-effort, high-leverage** — batch them first day.

## Appendix B — Standard quality gate (every task)
`npm run typecheck` (0) · `npm run lint` (0) · `npm run build` (success) · relevant `qa-step*.ts` harness ·
manual mobile (320/375/390) + desktop click-through · for money/auth tasks: server-side + in-transaction +
auth/ownership re-check + audit log + idempotency (per `docs/ENGINEERING-GUARDRAILS.md`).

## Appendix C — What is already excellent (do not "fix")
Escrow state machine + UI · append-only ledger + CAS payouts · KYC + Sumsub-dormant fallback · AI Dispute
Judge · filters/sort + faceted counts + chips · empty/loading/error/success coverage · PDP JSON-LD + OG ·
sitemap/robots · ISR strategy · real-buyer-only reviews · no-fabricated-metrics honesty. The plan above
*extends* these strengths; it does not rebuild them.
```
