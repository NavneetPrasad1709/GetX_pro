# STEP 07 — Marketplace Browse / Search / Filter + Listing Detail

> Goal: The core shopping experience — find listings fast, and a high-converting product page
> full of trust signals. Postgres search now; Algolia later (Step 28).

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Frontend + Senior Performance Engineer of GETX. Read `CLAUDE.md` +
`docs/STRATEGY.md` (fast + trust = conversion). Work in `D:\GetX`. This is **Step 07 — Browse + detail**.
Talk Hinglish. Follow the full workflow.

### Task
1. **Marketplace page** (`/marketplace`): grid of ACTIVE listings using `ListingCard`.
   - **Search**: Postgres full-text / `ILIKE` on title+description (debounced).
   - **Filters**: game, category/type, price range, delivery type (instant/manual), min seller
     trust/rating, currency. Filters reflected in URL query params (shareable, SEO-ok).
   - **Sort**: newest, price ↑/↓, rating, trust score. **Pagination** (or load-more) server-side.
   - Server-rendered results for SEO + speed; show count, active filter chips, clear-all.
2. **Listing detail page** (`/listing/[slug]`): images gallery, title, price, delivery type +
   estimated speed, full description, dynamic attributes, stock.
   - **Seller trust panel**: avatar, display name, trust score, rating (stars + count), total sales,
     verified/KYC badge, "Escrow Protected" + "Money-back" badges.
   - **Buy box**: quantity (if applicable), total with fee preview, big "Buy Now" CTA (wires to
     checkout in Step 08), "Chat with seller" button (wires in Step 11).
   - **SEO**: `generateMetadata` + JSON-LD `Product` structured data. Server-rendered.
3. **States**: loading skeletons, empty results ("No listings match — adjust filters"), out-of-stock.
4. **Performance**: index-backed queries (use the indexes from Step 02), avoid N+1 (include seller +
   game in one query), image optimization (next/image), no big client bundles.

### Rules
- Server components for content + SEO. Keep client JS minimal (only interactive filters).
- All queries via services; use DB indexes; no N+1.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Search returns relevant results; filters + sort + pagination work and persist in URL
- [ ] Listing detail shows all info + seller trust panel + working Buy CTA (to checkout)
- [ ] JSON-LD Product + metadata present; server-rendered
- [ ] Empty / loading / out-of-stock states handled
- [ ] No N+1 queries (seller+game included); queries hit indexes
- [ ] Mobile responsive; `typecheck`/`lint`/`build` pass; Lighthouse Perf ≥ 90 mobile
- [ ] Step 07 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Search + open a listing. Tell me **"Step 7 done"** → Step 08 (Checkout + order creation).

## 🔑 Tokens needed: **None.**
