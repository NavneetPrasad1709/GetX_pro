# GETX — Build Roadmap (Next.js + Prisma stack)

We build **one step at a time**. Each step gets a ready-made prompt file in `docs/prompts/`.

How to use:
1. Open the current step's prompt file.
2. Copy its full content → paste to Claude Code.
3. Let Claude finish + run the QA checks at the bottom.
4. Tick the box here, then ask for the next step.

Legend: `[ ]` todo · `[x]` done · 🔑 = needs a token/credential (Claude will tell you exactly which)

---

## Phase 0 — Foundation
- [x] **Step 01** — Next.js setup (TS, Tailwind, shadcn, Prisma, folder structure, env) → `step-01-setup.md` ✅
- [x] **Step 02** 🔑 — Database schema + Neon connect + migrate + seed (users, sellers, games, listings, orders, escrow, chat, reviews, disputes, wallet) → `step-02-database.md` ✅
- [x] **Step 03** — Auth + roles (buyer/seller/admin), sessions, bot protection → `step-03-auth.md` ✅
- [x] **Step 04** — Design system + layout (dark gaming UI, mobile-first, GETX branding) → `step-04-design.md` ✅

## Phase 1 — MVP Marketplace (Months 1-3 · goal: first 100 sales · 5 games, Pokemon GO first)
- [x] **Step 05** — Game catalog (5 games) + categories (accounts/items/currency/boosting) → `step-05-catalog.md` ✅
- [x] **Step 06** — Seller onboarding (5-min) + create/manage listings → `step-06-seller.md` ✅
- [x] **Step 07** — Marketplace browse/search/filter + listing detail page → `step-07-browse.md` ✅
- [ ] **Step 08** — Checkout + order creation flow → `step-08-checkout.md`
- [ ] **Step 09** 🔑 — Payments: CoinGate (crypto) + Razorpay (UPI) + webhooks → `step-09-payments.md`
- [ ] **Step 10** — Escrow + delivery confirm + 3-day buyer protection + auto-release (Vercel Cron) → `step-10-escrow.md`
- [ ] **Step 11** 🔑 — Real-time chat (Socket.io server on Railway) → `step-11-chat.md`
- [ ] **Step 12** 🔑 — Image/file upload (Cloudflare R2) → `step-12-uploads.md`
- [ ] **Step 13** — Reviews & ratings → `step-13-reviews.md`
- [ ] **Step 14** — Wallet + seller payouts → `step-14-wallet.md`
- [ ] **Step 15** — Manual KYC + basic admin + manual dispute handling → `step-15-admin.md`

## Phase 2 — Growth (Months 4-12 · goal: 1000+ users · AI moats + retention)
- [ ] **Step 16** 🔑 — AI Support bot 24/7 (Claude API) → `step-16-ai-support.md`
- [ ] **Step 17** — Live Trust Score (real-time via Socket.io + cron recompute) → `step-17-trust-score.md`
- [ ] **Step 18** — AI Fraud Radar → `step-18-fraud-radar.md`
- [ ] **Step 19** — Auto-delivery (instant codes/accounts) → `step-19-auto-delivery.md`
- [ ] **Step 20** — Seller "CEO" dashboard (Tremor + Recharts: profit, trends, AI pricing) → `step-20-ceo-dashboard.md`
- [ ] **Step 21** — Loyalty points + referral → `step-21-loyalty-referral.md`
- [ ] **Step 22** 🔑 — Notifications (email via Resend + in-app) → `step-22-notifications.md`
- [ ] **Step 23** — i18n multi-language (next-intl) → `step-23-i18n.md`
- [ ] **Step 24** — Mobile-first PWA → `step-24-pwa.md`

## Phase 3 — Market Leader (Year 2+ · dominate the niche)
- [ ] **Step 25** — AI Dispute Judge (Claude + pgvector memory of past disputes) → `step-25-dispute-judge.md`
- [ ] **Step 26** — AI demand forecast + AI pricing → `step-26-ai-pricing.md`
- [ ] **Step 27** — Community layer (guides, leaderboards, profiles, creator badges) → `step-27-community.md`
- [ ] **Step 28** 🔑 — Algolia search upgrade (when listings grow) → `step-28-search.md`
- [ ] **Step 29** 🔑 — Sumsub automated KYC + AML compliance → `step-29-sumsub.md`
- [ ] **Step 30** — Add more games → `step-30-more-games.md`

## Phase 4 — Launch & Ops (cross-cutting, do before/at go-live)
- [ ] **Step 31** 🔑 — Observability: Sentry + PostHog → `step-31-observability.md`
- [ ] **Step 32** 🔑 — Security hardening + rate limiting + Cloudflare WAF → `step-32-security.md`
- [ ] **Step 33** — Performance (caching, bundle, CWV, query tuning) → `step-33-performance.md`
- [ ] **Step 34** — Testing (unit + integration + e2e) → `step-34-testing.md`
- [ ] **Step 35** 🔑 — CI/CD (GitHub Actions) + deploy (Vercel + Railway + Neon + Cloudflare) → `step-35-deploy.md`
- [ ] **Step 36** — Post-deploy checks + monitoring + seed 10 sellers (GO LIVE) → `step-36-golive.md`

---

> Prompt files are created **one step at a time** so they stay accurate to the latest code.
> Right now only `step-01-setup.md` exists. Finish it, then ask for Step 02.
