# STEP 06 — Seller Onboarding + Create/Manage Listings

> Goal: Fast (5-min) seller onboarding + a great listing creation/management flow. Strategy:
> make sellers feel like business owners. Ownership + validation enforced (guardrail §7, §8).

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Product Manager + Senior Backend Developer of GETX. Read `CLAUDE.md`,
`docs/STRATEGY.md` (Seller = CEO), `docs/ENGINEERING-GUARDRAILS.md`. Work in `D:\GetX`.
This is **Step 06 — Seller onboarding + listings**. Talk Hinglish. Follow the full workflow.

### Task
1. **Become a seller** flow (`/sell` / `(dashboard)/seller/start`): if BUYER, a short form
   (display name, country, agree to terms) → upgrades role to SELLER, creates SellerProfile + Wallet
   (idempotent). Requires verified email. Welcoming, "first listing free" messaging.
2. **Create listing** (`(dashboard)/seller/listings/new`): react-hook-form + Zod.
   - Fields: game, category, type (ACCOUNT/ITEM/CURRENCY/BOOSTING), title, description, priceMinor
     (input in currency, store minor), currency, stock, deliveryType (MANUAL/INSTANT), images
     (placeholder upload now — real R2 in Step 12), and **dynamic attributes** based on type
     (e.g. account: level, rank, server; currency: amount, min/max).
   - Server Action validates + recomputes, creates Listing as `DRAFT` then `ACTIVE` on publish.
3. **Manage listings** (`(dashboard)/seller/listings`): table/grid of the seller's listings with
   edit, pause/activate, delete (soft → `REMOVED`), status badges. **Ownership enforced** on every action.
4. **Seller dashboard home** (`(dashboard)/seller`): basic stats (active listings, pending orders,
   wallet balance from ledger, rating). Rich charts = later (Step 20) — keep simple now.
5. **Validation/edge cases**: price > 0, stock ≥ 0, unverified seller blocked, non-owner blocked,
   slug uniqueness, empty states, loading states.

### Rules
- Mutations via Server Actions; re-check auth + role + ownership inside each.
- Money input handled carefully → store as integer minor units. Never trust client price on order (later).
- Reusable form components; business logic in `src/server/services/listings.ts`.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Buyer → seller upgrade works; creates SellerProfile + Wallet; needs verified email
- [ ] Create listing works for all 4 types; dynamic attributes save correctly
- [ ] Price stored as minor units; displayed correctly
- [ ] Edit / pause / delete work; **non-owner cannot** edit/delete (test it)
- [ ] Unverified or non-seller blocked from selling
- [ ] Empty/loading states; mobile responsive forms
- [ ] `typecheck` / `lint` / `build` pass
- [ ] Step 06 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Create 2-3 test listings as a seller. Tell me **"Step 6 done"** → Step 07 (Browse + listing detail).

## 🔑 Tokens needed: **None.** (Image upload is placeholder; real Cloudflare R2 = Step 12.)
