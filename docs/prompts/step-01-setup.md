# STEP 01 — Project Setup (paste this whole PROMPT to Claude Code)

> Goal: Ek chalne wala Next.js 15 project khada karna with TypeScript, Tailwind, shadcn/ui,
> Prisma, the agreed folder structure, env files, and npm scripts.
> NO features yet — sirf strong foundation. Database connect Step 02 me hoga.

---

## PROMPT (copy from here ⬇️)

You are the CTO of GETX. First read `CLAUDE.md`, `docs/STRATEGY.md`, and `docs/FOLDER-STRUCTURE.md`,
then follow CLAUDE.md exactly. Work in `D:\GetX`. This is **Step 01 — Project Setup**.
Talk to me in Hinglish. Follow the mandatory workflow (Understand → Analyze → Plan → Implement →
Self-review → QA → Report).

### Important context
- `D:\GetX` already contains: `CLAUDE.md`, `docs/`, `getx-strategy.html`, `getx-guide.html`.
  **Preserve all of these.** Do not delete or overwrite them.
- Stack is FINAL (see CLAUDE.md §3): Next.js 15 + TS + Tailwind + shadcn/ui + Prisma + Neon.
  Payments later = CoinGate + Razorpay (NO Stripe). Realtime later = Socket.io on Railway.
  **Do NOT add Medusa, Mercur, or Stripe.**

### Task
1. **Scaffold Next.js 15** (App Router) in the current directory `D:\GetX` with:
   TypeScript (strict), Tailwind CSS, ESLint, `src/` directory, App Router, import alias `@/*`.
   Use the non-interactive flag (`--yes`) so it does not hang. Keep our existing `docs/`,
   `CLAUDE.md`, and `*.html` — only add the Next.js files alongside them.

2. **Install core dependencies:**
   - `prisma` (dev) + `@prisma/client`
   - `zod`
   - `react-hook-form` + `@hookform/resolvers`
   - `lucide-react`
   - `clsx` + `tailwind-merge`
   - `framer-motion`

3. **Initialize shadcn/ui** (non-interactive), neutral base color, dark mode support. Add base
   components: `button`, `input`, `label`, `card`, `badge`, `dropdown-menu`, `dialog`, `sonner`
   (toast), `skeleton`, `avatar`, `separator`, `tabs`.

4. **Initialize Prisma** (`prisma init`, provider = postgresql). Do NOT design tables yet
   (that is Step 02). Keep `prisma/schema.prisma` with datasource + generator + one note comment.

5. **Create the folder structure** from CLAUDE.md §5 (use `.gitkeep` where a folder would be empty):
   `src/app/(marketing)`, `src/app/(shop)`, `src/app/(auth)`, `src/app/(dashboard)`,
   `src/app/admin`, `src/app/api`, `src/components/ui`, `src/components/layout`,
   `src/components/marketplace`, `src/components/shared`, `src/lib`, `src/server/actions`,
   `src/server/services`, `src/hooks`, `src/types`, `src/config`.
   Also create an empty `socket-server/` folder with a `.gitkeep` (Socket.io comes in Step 11).

6. **Create `src/lib/db.ts`** — a Prisma client **singleton** (safe for Next.js hot reload).

7. **Create `src/lib/utils.ts`** — the `cn()` helper (clsx + tailwind-merge). (shadcn may add this;
   if so, keep it.)

8. **Create `src/config/site.ts`** — export site config: name `"GETX"`, domain `"getx.live"`,
   a short description, url from env, supported currencies (`INR`, `USDT`, `BTC`, `ETH`),
   the launch games list (`["Pokemon GO", "Clash of Clans", "Valorant", "Free Fire", "PUBG Mobile"]`),
   and a **`fees` config object exactly as in `docs/FEES.md`** (sellerCommissionPercent per category
   ACCOUNT 8 / BOOSTING 6 / ITEM 8 / CURRENCY 7, buyerPlatformFeePercent 5, rounding HALF_UP). Keep it
   configurable (read here, not hardcoded in components).

9. **Environment files:**
   - `.env.example` — keys only, no values: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
     `NEXT_PUBLIC_APP_URL`, and a commented `# added later:` block for
     `R2_*`, `COINGATE_*`, `RAZORPAY_*`, `ANTHROPIC_API_KEY`, `SOCKET_SERVER_URL`.
   - `.env.local` — same keys, empty/placeholder values.
   - Ensure `.gitignore` ignores `.env*` (EXCEPT `.env.example`), `node_modules`, `.next`.

10. **Replace homepage** `src/app/page.tsx` with a clean placeholder that renders
    "GETX — Gaming Marketplace · Foundation ready ✅" using shadcn `Card` + `Button`, centered,
    responsive, dark-mode aware. (Real homepage = Step 04/05.)

11. **Update `src/app/layout.tsx`** — metadata (title/description from site config), add the
    `Toaster` (sonner) provider, `lang="en"`, clean base font, dark background.

12. **package.json scripts** — ensure these exist:
    `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`),
    `db:generate` (`prisma generate`), `db:push` (`prisma db push`), `db:studio` (`prisma studio`),
    `db:seed` (`tsx prisma/seed.ts` — create the seed file as an empty stub for now).

13. **Create `README.md`** — project = GETX (getx.live), the stack, how to run
    (`npm install`, set env, `npm run dev`), link to `docs/ROADMAP.md`. Short.

### Rules
- Do not design DB tables (Step 02). Do not build auth (Step 03). Do not add payments/AI/socket yet.
- No TODOs/placeholders left in code. Preserve our planning files.

### Report back
Use the CLAUDE.md output format and finish with the QA CHECKLIST results below.

---

## ✅ QA CHECKLIST (Claude must run these and report pass/fail)

**Build & types**
- [ ] `npm install` completes with no errors
- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run lint` → 0 errors
- [ ] `npm run build` → success
- [ ] `npm run dev` starts and homepage loads at http://localhost:3000

**Structure**
- [ ] All folders from CLAUDE.md §5 exist (incl. empty `socket-server/`)
- [ ] `src/lib/db.ts` exports a Prisma singleton
- [ ] `src/lib/utils.ts` exports `cn()`
- [ ] `src/config/site.ts` exports site config (GETX, getx.live, 5 games)
- [ ] shadcn components importable from `@/components/ui/*`

**Config & safety**
- [ ] `.env.example` has keys only (no secret values)
- [ ] `.env.local` exists and is gitignored
- [ ] No secret/token hardcoded anywhere
- [ ] `prisma/schema.prisma` has datasource + generator (no tables yet)

**Preserved files (still exist & unchanged)**
- [ ] `CLAUDE.md`, `docs/STRATEGY.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md` intact
- [ ] `getx-strategy.html`, `getx-guide.html` intact

**UX**
- [ ] Homepage responsive at mobile width (~375px)
- [ ] Dark mode does not break the placeholder

**Final**
- [ ] Roadmap Step 01 ticked in `docs/ROADMAP.md`
- [ ] Final Status: ✅ Pass

> ⚠️ If anything is ❌, Claude must fix it and re-run the checklist before saying done.

---

## 👉 What YOU (owner) do after this step
1. Paste the PROMPT above into Claude Code (or tell me "Step 1 start karo" — I am your Claude Code).
2. When done, run `npm run dev`, open http://localhost:3000 — "Foundation ready ✅" card dikhna chahiye.
3. Tell me **"Step 1 done"** → I create **Step 02 — Database schema + Neon connect**.

## 🔑 Tokens needed for THIS step
**None.** (Step 02 will need a **Neon** Postgres connection string — free. Main step-by-step
bataunga kaise lena hai.)
