# GETX — Gaming Marketplace (getx.live)

Fast, AI-powered, trust-first gaming marketplace — buy & sell game accounts, items, in-game
currency and boosting with escrow protection.

## Tech stack
- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS v4** + **shadcn/ui**
- **PostgreSQL (Neon)** + **Prisma**
- **Socket.io** (realtime chat, runs on Railway) · **Vercel Cron** (escrow auto-release)
- **Cloudflare R2** (storage) · **Claude API** (AI features)
- **Payments:** CoinGate (crypto) + Razorpay (UPI) — no Stripe
- **Hosting:** Vercel (app) · Railway (socket server) · Neon (DB)

## Getting started
```bash
npm install
# create .env from the template and fill values (Neon DB string comes in Step 02)
cp .env.example .env
npm run dev          # http://localhost:3000
```

## Scripts
- `npm run dev` / `build` / `start` / `lint`
- `npm run typecheck` — TypeScript check
- `npm run db:generate` / `db:migrate` / `db:push` / `db:studio` / `db:seed`

## Project docs (read these)
- `CLAUDE.md` — how this project is built (rules for AI/devs)
- `docs/START-HERE.md` — the paste-and-build guide
- `docs/ROADMAP.md` — all build steps
- `docs/STRATEGY.md` · `docs/FEES.md` · `docs/ENGINEERING-GUARDRAILS.md` · `docs/FOLDER-STRUCTURE.md`

Built step-by-step. See `docs/ROADMAP.md` for the current step.
