# STEP 27 — Community (Guides, Leaderboards, Badges)

> Goal: Community layer — seller social proof, game guides, per-game leaderboards, and creator badges
> that reward engagement and surface trusted sellers to buyers.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Full-Stack + Senior Backend Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §5, §7). Work in `D:\GetX`. This is **Step 27 — Community**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Database models + migration** (`prisma/schema.prisma` + new migration folder
   `prisma/migrations/20260608XXXXXX_step27_community/`):

   - **`Guide`**:
     ```
     id          String   @id @default(cuid())
     authorId    String
     author      User     @relation(fields: [authorId], references: [id])
     gameId      String
     game        Game     @relation(fields: [gameId], references: [id])
     title       String
     slug        String   @unique
     content     String   // Markdown text, stored as-is
     published   Boolean  @default(false)
     viewCount   Int      @default(0)
     likeCount   Int      @default(0)
     createdAt   DateTime @default(now())
     updatedAt   DateTime @updatedAt
     views       GuideView[]
     likes       GuideLike[]
     @@index([gameId])
     @@index([authorId])
     @@index([published, createdAt])
     ```
   - **`GuideView`**:
     ```
     id        String   @id @default(cuid())
     userId    String
     user      User     @relation(fields: [userId], references: [id])
     guideId   String
     guide     Guide    @relation(fields: [guideId], references: [id], onDelete: Cascade)
     createdAt DateTime @default(now())
     @@unique([userId, guideId])
     @@index([guideId])
     ```
   - **`GuideLike`**:
     ```
     id        String   @id @default(cuid())
     userId    String
     user      User     @relation(fields: [userId], references: [id])
     guideId   String
     guide     Guide    @relation(fields: [guideId], references: [id], onDelete: Cascade)
     createdAt DateTime @default(now())
     @@unique([userId, guideId])
     @@index([guideId])
     ```
   - **`Badge`**:
     ```
     code        String   @id                // e.g. "EARLY_SELLER"
     name        String
     description String
     iconUrl     String
     userBadges  UserBadge[]
     ```
   - **`UserBadge`**:
     ```
     id          String         @id @default(cuid())
     userId      String
     user        User           @relation(fields: [userId], references: [id])
     badgeCode   String
     badge       Badge          @relation(fields: [badgeCode], references: [code])
     awardedAt   DateTime       @default(now())
     awardedBy   BadgeAwardedBy // SYSTEM | ADMIN
     @@unique([userId, badgeCode])
     @@index([userId])
     ```
   - Add enum **`BadgeAwardedBy`** (`SYSTEM`, `ADMIN`).
   - **Seed badges** in `prisma/seed.ts` (use `upsert` on `code` so it is idempotent):
     - `EARLY_SELLER` — "Early Seller" — "One of the first 50 sellers on GETX"
     - `TOP_SELLER` — "Top Seller" — "Top 10 sellers for a game in a calendar month"
     - `TRUSTED_VETERAN` — "Trusted Veteran" — "500+ completed orders"
     - `GUIDE_AUTHOR` — "Guide Author" — "Published at least one community guide"
     - `COMMUNITY_HERO` — "Community Hero" — "Awarded by the GETX team"
   - Place placeholder badge icon URLs pointing to a public CDN path (e.g.
     `/badges/early-seller.svg`) — real icons can be swapped later.
   - Generate the migration using the interactive-safe workflow:
     `npx prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma --script`
     → paste output into the hand-written migration SQL file → run `npx prisma migrate deploy`.
     Do NOT run `prisma migrate dev` (it is interactive and will hang).

2. **Badge service** (`src/server/services/badges.ts`):
   - `awardBadge(userId: string, badgeCode: string, awardedBy: BadgeAwardedBy): Promise<void>` —
     upserts a `UserBadge` row (skip if already awarded — `@@unique` prevents duplicates). Fire a
     Sentry breadcrumb on first award for observability. Never throw on duplicate; silently return.
   - `checkAndAwardMilestoneBadges(userId: string, totalSales: number): Promise<void>` — called
     inside `escrow.ts` `releaseOrder` immediately after incrementing `SellerProfile.totalSales`.
     Awards:
     - `TRUSTED_VETERAN` when `totalSales >= 500` (SYSTEM).
     - `EARLY_SELLER` when the seller is among the first 50 ever registered sellers (check
       `SELECT COUNT(*) FROM SellerProfile WHERE createdAt <= seller.createdAt` at award time; only
       award once — the `@@unique` guard is the safety net).
   - `checkAndAwardGuideAuthorBadge(userId: string): Promise<void>` — called after a guide is
     published (admin approve or auto-publish). Awards `GUIDE_AUTHOR` (SYSTEM) if not already held.
   - `awardTopSellerBadges(): Promise<void>` — intended for the monthly Vercel Cron job (Step 27
     adds the cron; wiring into `vercel.json` is in sub-task 9). Queries:
     ```sql
     SELECT sellerId, gameId, COUNT(*) as cnt
     FROM Order
     WHERE status = 'COMPLETED'
       AND completedAt >= (now() - interval '30 days')
     GROUP BY sellerId, gameId
     ORDER BY gameId, cnt DESC
     ```
     For each distinct `gameId`, take the top 10 `sellerId` rows, call `awardBadge` for each.
     All other `TOP_SELLER` `UserBadge` rows are NOT revoked (badges are permanent once earned —
     add a note in code comments; a future step can add expiry if needed).
   - Export a `getUserBadges(userId: string): Promise<UserBadge[]>` helper (ordered `awardedAt ASC`).

3. **Guide service** (`src/server/services/guides.ts`):
   - `getPublishedGuides(filters: { gameId?: string; take?: number; skip?: number }): Promise<Guide[]>`
     — only `published = true`; ordered `createdAt DESC`.
   - `getGuideBySlug(slug: string): Promise<Guide | null>` — includes author + game.
   - `incrementViewCount(guideId: string, userId: string): Promise<void>` — upsert a `GuideView`
     row; if newly inserted (i.e. not already present for this user), also increment `Guide.viewCount`
     by 1 via `UPDATE … SET viewCount = viewCount + 1`. If the userId matches the authorId, skip
     the increment (authors do not inflate their own views). All inside a single transaction.
   - `toggleLike(guideId: string, userId: string): Promise<{ liked: boolean }>` — if `GuideLike`
     for `(userId, guideId)` does not exist: create it + `viewCount` stays; increment `likeCount`.
     If it exists: delete it + decrement `likeCount` (floor at 0). Return `{ liked: true/false }`.
     Use a serializable transaction for the check-then-act.
   - `createGuide(input: CreateGuideInput, authorId: string): Promise<Guide>` — validates title,
     slug uniqueness (throw on P2002), content non-empty. Sets `published = false` unless caller
     is TRUSTED_VETERAN (check `SellerProfile.totalSales >= 500`), in which case auto-publish and
     call `checkAndAwardGuideAuthorBadge` inside the same transaction.
   - `updateGuide(guideId: string, authorId: string, input: Partial<CreateGuideInput>): Promise<Guide>`
     — ownership check; if re-slugging, enforce uniqueness.
   - `publishGuide(guideId: string, adminId: string): Promise<Guide>` — sets `published = true`,
     calls `checkAndAwardGuideAuthorBadge(guide.authorId)`.
   - `unpublishGuide(guideId: string, adminId: string): Promise<Guide>` — sets `published = false`.
     Does NOT revoke the `GUIDE_AUTHOR` badge.

4. **Leaderboard pages** (`src/app/(marketing)/leaderboards/`):

   - **`/leaderboards/page.tsx`** — server component; shows a tab strip of all active games; renders
     the global top 10 sellers (by `totalSales` on `SellerProfile`) as a fallback overview, plus
     links to per-game leaderboards. Use `next/cache` with `revalidate: 3600`.
   - **`/leaderboards/[gameSlug]/page.tsx`** — server component; queries top 10 sellers for that
     game (completed orders in last 30 days, raw Prisma query via `$queryRaw`); each row shows:
     rank medal (1st/2nd/3rd gold/silver/bronze, rest numbered), seller avatar + username + badges
     (icon strip, max 5), star rating (`ratingAvg`/`ratingCount`), total completed sales. Use
     `next/cache` with `revalidate: 3600`. `generateMetadata` returns game-specific SEO title +
     description. If `gameSlug` is unknown, return `notFound()`.
   - Both pages use the v10 dark + blue (`#4d7cfe`) design with Poppins headings. Mobile-first card
     layout on small screens, table layout on md+.

5. **Guide list + detail pages** (`src/app/(marketing)/guides/`):

   - **`/guides/page.tsx`** — server component; displays published guides with optional `?game=<slug>`
     filter. Each guide card shows title, author avatar + username, game tag, `likeCount`, `viewCount`,
     creation date. `generateMetadata` returns generic SEO metadata. Pagination (12 per page, `?page=`
     param). Use `next/cache` with `revalidate: 3600`.
   - **`/guides/[slug]/page.tsx`** — server component wrapper that:
     1. Fetches guide by slug; calls `notFound()` if missing or unpublished.
     2. If user is logged in, calls `incrementViewCount` server-side (via a server action triggered
        on mount, not blocking render).
     3. Renders `<GuideContent>` — a client component that uses `react-markdown` with
        `rehype-highlight` and `remark-gfm` for full Markdown + syntax highlighting. Never use
        `dangerouslySetInnerHTML` with user-supplied raw HTML.
     4. Shows author card (avatar, username, badges, rating, sales count, link to seller profile).
     5. Like button — client component, calls a server action `toggleGuide Like`; optimistic UI
        (increment/decrement `likeCount` locally before server confirmation).
     6. `generateMetadata`: title = guide title + " | GETX Guides", description = first 160 chars
        of content (strip Markdown syntax), OG image = game banner.
   - Install required packages: `react-markdown`, `rehype-highlight`, `remark-gfm`. Add
     `highlight.js` CSS import in the relevant layout or the guide page.

6. **Seller profile community section** (`src/app/(shop)/sellers/[id]/page.tsx`):
   - This page may be new or may already exist from Step 07/15. If it does not exist, create it as
     a public server component at that path.
   - Add a **Badges row** at the top of the profile: render each `UserBadge` as an icon + tooltip
     (badge name + description); ordered `awardedAt ASC`. If none, show nothing (no placeholder clutter).
   - Add community stats: guide count (published), current leaderboard rank for the seller's primary
     game (query the same 30-day window, return rank or "Unranked").
   - Add a **Community tab** alongside existing tabs: shows the seller's published guides (title,
     likeCount, viewCount, link); empty state if none.
   - `generateMetadata` updated to include badge names in keywords.

7. **Seller guide editor** (`src/app/(dashboard)/seller/guides/`):
   - **`/seller/guides/page.tsx`** — lists seller's own guides (published + draft); columns: title,
     game, status (Published/Draft), views, likes, edit link, delete button. Server component with
     Suspense.
   - **`/seller/guides/new/page.tsx`** — client form component using `@uiw/react-md-editor` (install
     package) with a "Write" / "Preview" tab. Fields: title (max 120 chars), game select, content
     (md-editor, min 100 chars after stripping Markdown syntax). Auto-generates a URL-safe slug from
     the title on blur (kebab-case, max 80 chars, appended with a short cuid suffix to guarantee
     uniqueness). Submits via server action `createGuide`. On success, redirect to
     `/seller/guides`. If the author is TRUSTED_VETERAN, show a notice "Your guide will be published
     immediately." Otherwise "Your guide will be reviewed before publishing."
   - **`/seller/guides/[id]/edit/page.tsx`** — same editor prefilled with existing guide data;
     cannot change `slug` directly (slug is locked after first publish to preserve SEO). Submits via
     `updateGuide`. Show a "Request re-publish" flow if the guide was previously published and then
     edited (set `published = false` automatically on save to trigger admin review).
   - All seller guide routes are SELLER-role gated and ownership-checked in the server actions.

8. **Admin guide management** (`src/app/admin/guides/page.tsx`):
   - Lists all guides (published + draft), filterable by `published` status and game. Columns: title,
     author, game, published status, views, likes, created. Actions: Publish (calls `publishGuide`
     server action) / Unpublish (calls `unpublishGuide` server action). Each action writes an
     `AuditLog` entry. Admin route is ADMIN-role gated.

9. **Vercel Cron — monthly TOP_SELLER badge sweep**:
   - Add a new Vercel Cron route at `src/app/api/cron/award-top-sellers/route.ts`.
   - Handler: verify the `Authorization: Bearer <CRON_SECRET>` header (fail-closed: 401 if missing
     or wrong). Call `badges.awardTopSellerBadges()`. Return JSON `{ awarded: N }`.
   - Register in `vercel.json`:
     ```json
     { "path": "/api/cron/award-top-sellers", "schedule": "0 0 1 * *" }
     ```
     (runs at 00:00 on the 1st of each month). Add `CRON_SECRET` to `.env.example`.
   - If `CRON_SECRET` env var is absent, log a Sentry warning and return 503 (feature disabled,
     never crash the app).

10. **Edge cases**:
    - Slug collision on guide creation: catch Prisma P2002 on `slug`; surface a user-friendly
      "Title already taken — try a different one" error.
    - Guide delete by seller: only allowed if `published = false` (drafts). Published guides can only
      be unpublished by admin, not deleted, to preserve SEO and inbound links.
    - `incrementViewCount` called for unauthenticated user: skip the `GuideView` upsert; still
      return without error (viewCount will only track logged-in views; that is acceptable for MVP).
    - `toggleLike` for unauthenticated user: return 401 from the server action.
    - Leaderboard for a game with fewer than 10 sellers: return all available sellers (do not pad).
    - `awardTopSellerBadges` called manually while a previous call is in flight: idempotent by
      design (`@@unique` on `UserBadge`); safe to run multiple times.
    - `react-markdown` rendering of user content: sanitize by NOT passing `rehype-raw`; only
      `remark-gfm` + `rehype-highlight` — this prevents XSS from malicious HTML in Markdown.
    - `@uiw/react-md-editor` is a client-only component (uses `window`); import it with
      `dynamic(() => import('@uiw/react-md-editor'), { ssr: false })` to avoid SSR errors.
    - `Guide.content` is stored raw (Markdown); never store HTML in the DB. Render-time only.

### Rules
- Markdown guide content is rendered via `react-markdown` + `remark-gfm` + `rehype-highlight`
  only — no `dangerouslySetInnerHTML`, no `rehype-raw`. This is non-negotiable (XSS prevention).
- Badge awards are idempotent via `@@unique([userId, badgeCode])`. Never award the same badge
  twice; use `upsert` or catch P2002 silently — do not throw to the caller.
- All guide mutations (create/update/publish/unpublish/delete) check **role + ownership** in the
  server action before touching the DB. Published-guide delete is blocked for non-admin.
- Leaderboard and guide list pages use `next/cache` with `revalidate: 3600`; they are
  unauthenticated public pages and must never block on a slow DB query (add a 3-second `timeout`
  hint via Prisma's `$queryRawUnsafe` or a query timeout wrapper if needed).

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Migration runs cleanly via `migrate deploy`; all new tables exist with correct columns + indexes
- [ ] Seed: all 5 badges upserted correctly (`Badge.code` PK enforces idempotency)
- [ ] `awardBadge` is idempotent — calling twice for same `(userId, badgeCode)` does not throw or duplicate
- [ ] `TRUSTED_VETERAN` badge awarded automatically when `totalSales` reaches 500 (test by directly calling `checkAndAwardMilestoneBadges`)
- [ ] `EARLY_SELLER` badge: seller within first 50 receives it; seller #51 does not
- [ ] `GUIDE_AUTHOR` badge: awarded on first guide publish (both admin-publish and TRUSTED_VETERAN auto-publish paths)
- [ ] `awardTopSellerBadges` awards `TOP_SELLER` to top 10 sellers per game based on 30-day completed orders; calling twice does not duplicate
- [ ] `/api/cron/award-top-sellers` returns 401 without valid `CRON_SECRET`; returns 200 with correct secret
- [ ] Leaderboard `/leaderboards/[gameSlug]`: top 10 sellers appear in correct order; rank medals shown; unknown `gameSlug` returns 404
- [ ] Leaderboard pages have `Cache-Control` headers and revalidate correctly (confirm `revalidate: 3600` in source)
- [ ] `/guides` page shows only published guides; `?game=<slug>` filter works correctly
- [ ] `/guides/[slug]` renders Markdown correctly (headings, code blocks with syntax highlighting, bold, links)
- [ ] No raw HTML injection possible: guide with `<script>alert(1)</script>` in content renders as escaped text
- [ ] `incrementViewCount` increments `Guide.viewCount` exactly once per unique logged-in user; calling twice for same user leaves count unchanged
- [ ] Author viewing own guide does NOT increment view count
- [ ] `toggleLike` increments `likeCount` on first call, decrements on second call (idempotent toggle)
- [ ] `toggleLike` for unauthenticated user returns 401
- [ ] Guide slug collision returns user-friendly error, not a 500
- [ ] Seller guide editor (`/seller/guides/new`): md-editor loads client-side only (no SSR error); form validates min/max; slug auto-generated from title
- [ ] TRUSTED_VETERAN seller submitting a guide auto-publishes it and awards `GUIDE_AUTHOR` badge in the same transaction
- [ ] Non-TRUSTED_VETERAN guide submission creates a draft (`published = false`)
- [ ] Admin `/admin/guides`: publish action sets `published = true` + writes AuditLog; unpublish sets `published = false` + writes AuditLog
- [ ] Seller cannot delete a published guide; can delete a draft
- [ ] Seller profile `/sellers/[id]`: badges row visible with tooltips; guide count and leaderboard rank shown; Community tab lists published guides
- [ ] `scripts/qa-step27.ts` passes all assertions: badge milestone awards, leaderboard ordering, slug uniqueness enforcement, view increment idempotency, like toggle idempotency
- [ ] `typecheck`/`lint`/`build` pass; all new pages are mobile responsive; no `any` types introduced
- [ ] Step 27 ticked in `docs/ROADMAP.md`; key choices (react-markdown, @uiw/react-md-editor, badge codes, cron schedule) logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Move to **Step 28 — Algolia Search** (replace the current Postgres full-text search on listings
and guides with Algolia for instant, typo-tolerant search with faceted filtering by game, price,
and category).

## 🔑 Tokens needed: **None**
