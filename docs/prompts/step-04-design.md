# STEP 04 — Design System + Layout (GETX gaming UI)

> Goal: A modern, dark, mobile-first gaming look + reusable layout (header/footer/nav) and the
> shared UI building blocks every page will use. Conversion-focused, trust-signal-ready.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior UI/UX Designer + Senior Frontend Developer of GETX. Read `CLAUDE.md`
and `docs/STRATEGY.md` (trust signals matter). Work in `D:\GetX`. This is **Step 04 — Design system**.
Talk Hinglish. Follow the full workflow.

### Brand direction (from getx-strategy.html / getx-guide.html)
- Dark gaming aesthetic. Neon accents: lime/green `#aaff00`, cyan `#3ee7ff`, violet `#9d7bff`,
  with dark backgrounds (`#07090f` / `#0f1524`). Clean, fast, NOT cluttered (avoid G2G's mistake).
- Mobile-first (gamers are on phones). Big tap targets, fast feel, micro-animations (framer-motion).
- Vibe: trustworthy + premium + a little playful. Think "fast + safe".

### Task
1. **Tailwind theme**: define brand colors, radius, fonts as CSS variables + Tailwind tokens.
   Set up dark mode as default. Add a nice display font + body font (next/font).
2. **Layout components** (`src/components/layout/`):
   - `Header` — logo (GETX), game/category nav, search bar (UI only, wired in Step 07), auth state
     (from Step 03), "Sell" CTA, mobile hamburger drawer.
   - `Footer` — links, trust badges (Escrow Protected, Verified Sellers, Money-back), socials, payment icons.
   - `MobileNav` — bottom nav bar on mobile (Home, Browse, Sell, Orders, Account).
3. **Shared UI** (`src/components/shared/`): `PageContainer`, `SectionHeading`, `EmptyState`,
   `LoadingSkeleton` variants, `TrustBadge`, `Price` (formats minor units → currency), `Stat`,
   `Rating` (stars), `Avatar` wrapper. All responsive, dark-mode, accessible (aria labels).
4. **Marketplace primitives** (`src/components/marketplace/`): `ListingCard` (image, title, price,
   seller trust score, delivery badge, rating) + its skeleton + empty grid state. (Data wired later.)
5. **Theme/util**: ensure `cn()` used everywhere; toasts (sonner) styled to theme; consistent spacing scale.
6. **Update homepage** placeholder to use the new Header/Footer + a simple hero using brand styles
   (real homepage content = Step 05). Make sure it looks great on mobile + desktop.
7. **Accessibility pass**: color contrast OK, focus states visible, keyboard nav works, images have alt.

### Rules
- Reusable + composable components (SOLID). No business logic in components.
- Everything responsive + dark-mode + has loading/empty states where relevant.
- Keep it clean and fast — don't over-animate.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Header + Footer + MobileNav render and are responsive (test 375px, 768px, 1280px)
- [ ] Auth state shows correctly (logged in vs out) in header
- [ ] `Price` formats minor units correctly (e.g. 49900 → ₹499.00)
- [ ] `ListingCard` + skeleton + empty state look polished on mobile
- [ ] Dark mode consistent; contrast passes; focus states visible; keyboard nav works
- [ ] No layout shift / overflow on small screens
- [ ] `npm run typecheck` / `lint` / `build` pass
- [ ] Lighthouse (mobile) on homepage: Performance & Accessibility ≥ 90
- [ ] Step 04 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Open the site on your phone (or devtools mobile view) — it should feel like a real gaming marketplace.
Tell me **"Step 4 done"** → Step 05 (Game catalog).

## 🔑 Tokens needed for THIS step
**None.**
