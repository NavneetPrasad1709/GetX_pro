# GETX — Folder Structure (simple explanation)

Yeh poore project ka naksha hai. Stack: **Next.js 16 + Prisma + Neon** (+ ek chhota Socket.io
server Railway ke liye). Har folder ka kaam Hinglish me niche.

```
GetX/
├── CLAUDE.md                 # Claude ka rulebook (har session khud padhta hai)
├── README.md
├── .env                      # SECRETS (tokens) — git me kabhi nahi (Prisma + Next dono padhte hain)
├── .env.example              # sirf keys ke naam, values empty — git me jaata hai
│
├── docs/                     # saari planning
│   ├── STRATEGY.md           # business dimaag (kyun bana rahe hain)
│   ├── ROADMAP.md            # 35 steps (4 phases)
│   ├── FOLDER-STRUCTURE.md   # yeh file
│   ├── DECISIONS.md          # kaunsa decision kyun
│   └── prompts/              # ek-ek step ka ready prompt (tu paste karta hai)
│
├── getx-strategy.html        # original strategy (reference)
├── getx-guide.html           # original guide (reference)
│
├── public/                   # images, logo, icons
│
├── prisma/
│   ├── schema.prisma         # database design (tables/columns)
│   └── seed.ts               # demo/test data (5 games, sample sellers)
│
├── scripts/
│   └── seed-test-accounts.ts # test.buyer/test.seller/test.admin banata hai (idempotent)
│
├── socket-server/            # 🔌 alag chhota Socket.io Node server → Railway pe deploy
│   └── index.ts              # buyer↔seller chat, live trust score (real-time)
│
└── src/                      # asli app code (Next.js)
    │
    ├── proxy.ts              # 🔒 route protection (Next 16 ka middleware) — dashboard/admin redirects
    │
    ├── app/                  # Next.js routes = pages + API
    │   ├── (marketing)/      # home, how-it-works
    │   ├── (shop)/           # marketplace, game pages, listing detail (product page)
    │   ├── (auth)/           # login, register, verify-email, forgot/reset-password ✅ Step 03
    │   ├── (dashboard)/      # buyer + seller dashboard + become-seller ✅ Step 03
    │   ├── admin/            # admin panel (sirf ADMIN role) ✅ Step 03
    │   ├── api/              # backend endpoints
    │   │   └── auth/[...nextauth]/  # Auth.js (NextAuth v5) handlers
    │   ├── layout.tsx
    │   └── globals.css
    │
    ├── components/
    │   ├── ui/               # shadcn base (button, input, card...)
    │   ├── auth/             # login/register/reset forms + Turnstile widget ✅ Step 03
    │   ├── layout/           # site header + user menu ✅ Step 03
    │   ├── marketplace/      # listing card, filters, search bar
    │   └── shared/           # chhote reusable pieces
    │
    ├── lib/                  # helpers
    │   ├── db.ts             # ek hi Prisma connection (sab yahi use karein)
    │   ├── auth.ts           # Auth.js config + requireUser/requireRole/assertOwner
    │   ├── validators/       # Zod schemas (client + server dono ek hi schema)
    │   ├── rate-limit.ts     # in-memory IP rate limiter (Upstash Step 32 me)
    │   ├── tokens.ts         # verify/reset tokens (DB me sirf SHA-256 hash)
    │   ├── turnstile.ts      # Cloudflare Turnstile server-side verify
    │   ├── r2.ts             # Cloudflare R2 upload helper (Step 12)
    │   ├── ai.ts             # Claude API helper (Phase 2)
    │   └── utils.ts          # cn() + chhote helpers
    │
    ├── server/               # backend ka dimaag (business logic)
    │   ├── actions/          # "use server" actions (auth.ts ✅ Step 03)
    │   └── services/         # users + mail ✅ Step 03; orders, escrow, payouts aage
    │
    ├── hooks/                # react hooks
    ├── types/                # shared TypeScript types (next-auth.d.ts ✅ Step 03)
    └── config/              # site config + constants (fees, currencies, games)
```

## Yaad rakhne wale 6 rules (simple)

1. **Page banana hai?** → `src/app/...` me folder.
2. **Reusable UI (button/card)?** → `src/components/...`.
3. **Database chhuna hai (save/update/delete)?** → logic `src/server/services`, call
   `src/server/actions` se. UI me kabhi nahi.
4. **Real-time chat / live score?** → `socket-server/` (Railway). Baaki sab Vercel pe.
5. **Secret/token?** → sirf `.env`. Code me kabhi paste mat karo.
6. **Paisa?** → hamesha integer (paisa/cents), kabhi float me nahi.
