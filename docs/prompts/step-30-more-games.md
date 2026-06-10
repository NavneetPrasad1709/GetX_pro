# STEP 30 — Expand Catalog to 15 Games (CMS)

> Goal: Grow the game catalog from 5 to 15 games and give admins a no-code CMS to create, edit,
> and toggle games — so adding new titles never requires a code deploy again.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Full-Stack + Senior SEO Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§4, §5, §7). Work in `D:\GetX`. This is **Step 30 — Expand Catalog to 15 Games (CMS)**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Database — `Game.sortOrder` migration (if not already present)**

   Inspect `prisma/schema.prisma`. If `Game` does not have a `sortOrder Int @default(0)` field,
   add it now. Also confirm `Game` has `isActive Boolean @default(true)` and `slug String @unique`.
   If any of these fields are missing, add them in the same migration.

   Create the migration using the repo's interactive-safe workflow:
   ```
   npx prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/20260609140000_step30_game_sort_order/migration.sql
   ```
   Review the generated SQL, then: `npx prisma migrate deploy`.
   Never run `prisma migrate dev` (interactive, breaks this workflow).

   Add a `@@index([isActive, sortOrder])` composite index to `Game` for the homepage + browse
   queries that filter active games and sort by `sortOrder`.

2. **Seed 10 new games — `prisma/seed.ts`**

   Append to the existing seed (use `upsert` on `slug` so re-running is idempotent). Each game
   must have `isActive: true` and a unique `sortOrder` starting after the existing 5 games
   (e.g., existing games get `sortOrder` 1–5 on upsert, new games 6–15).

   Seed these 10 games with at minimum the categories listed (add more if game-appropriate):

   | Game | slug | Categories (kind) |
   |---|---|---|
   | BGMI | `bgmi` | ACCOUNT, CURRENCY, ITEM |
   | Call of Duty Mobile | `call-of-duty-mobile` | ACCOUNT, CURRENCY, ITEM |
   | Genshin Impact | `genshin-impact` | ACCOUNT, CURRENCY, ITEM |
   | Mobile Legends: Bang Bang | `mobile-legends` | ACCOUNT, CURRENCY, ITEM |
   | Arena of Valor | `arena-of-valor` | ACCOUNT, CURRENCY, ITEM |
   | Minecraft | `minecraft` | ACCOUNT, ITEM |
   | Roblox | `roblox` | CURRENCY, ITEM |
   | FIFA Mobile | `fifa-mobile` | ACCOUNT, CURRENCY, ITEM |
   | Brawl Stars | `brawl-stars` | ACCOUNT, CURRENCY, ITEM |
   | Fortnite | `fortnite` | ACCOUNT, CURRENCY, ITEM |

   Each game object must include: `name`, `slug`, `description` (2–3 sentences, SEO-appropriate),
   `isActive: true`, `sortOrder`, and an `imageUrl` pointing to
   `https://<R2_PUBLIC_URL>/games/<slug>.webp` (read the R2 public base URL from
   `process.env.R2_PUBLIC_URL` in the seed — fall back to a placeholder string if the env var
   is absent so seed never crashes in CI).

   After running the seed, confirm with `npx prisma db seed` (or `npx tsx prisma/seed.ts`).

3. **Admin CMS — `/admin/games`**

   Location: `src/app/admin/games/` (ADMIN role gate via the existing admin layout middleware).
   Build three sub-routes:

   **a. List page — `src/app/admin/games/page.tsx`**
   - Fetch all games ordered by `sortOrder` (active first, then inactive).
   - Render a table: Name, Slug, Categories count, Status (Active / Inactive badge), Sort Order,
     Actions (Edit, Toggle Active/Inactive).
   - Use `src/server/services/admin.ts` for data access (extend the existing admin service file;
     do not put DB queries directly in the page).
   - "Create game" button → `/admin/games/new`.

   **b. Create / Edit form — `src/app/admin/games/new/page.tsx` and `src/app/admin/games/[id]/edit/page.tsx`**
   - Shared form component: `src/components/admin/game-form.tsx`.
   - Fields (all Zod-validated, same schema client + server):
     - `name` (string, 1–80 chars)
     - `slug` (string, lowercase kebab, auto-derived from name but editable; unique constraint error
       surfaced as a user-friendly message — handle Prisma P2002 outside the transaction)
     - `description` (string, 10–1000 chars)
     - `imageUrl` (string URL, optional — defaults to the R2 pattern `/games/<slug>.webp` if blank)
     - `isActive` (checkbox)
     - `sortOrder` (integer ≥ 0)
     - `categoryKinds` (multi-select checkboxes: ACCOUNT | CURRENCY | ITEM | BOOST | COACHING —
       at least one required; creates/links `Category` rows for this game)
   - On submit: Server Action `upsertGameAction` in `src/server/actions/admin.ts`.
     - Create mode: `prisma.game.create` + `prisma.category.createMany` (one per selected kind,
       `skipDuplicates: true`) in a transaction.
     - Edit mode: `prisma.game.update` + sync categories (delete removed kinds, create new ones)
       in a transaction.
     - Both modes: write `AuditLog` (action: `"admin_game_create"` / `"admin_game_update"`,
       `adminId`, details JSON).
     - On success: `revalidatePath("/admin/games")` + `revalidatePath("/games")` +
       `revalidatePath("/sitemap.xml")` and redirect back to the list.
   - Edit page pre-populates from `getGameById(id)` (add to admin service).

   **c. Toggle active Server Action**
   - `toggleGameActiveAction(gameId: string)` in `src/server/actions/admin.ts`.
   - Flips `isActive`, writes `AuditLog` (action: `"admin_game_toggle"`), revalidates
     `/admin/games`, `/games`, `/sitemap.xml`, and the game's own `/games/<slug>` path.
   - Toggling to inactive must NOT delete listings — existing listings remain but the game page
     returns 404 and the game is excluded from browse/homepage queries.

4. **`src/config/games.ts` — `getGameCopy()` fallback for new games**

   Verify that `getGameCopy(slug: string)` already returns a generated fallback object
   (marketing headline, subheadline, whyBuy copy) when the slug is not in the hard-coded map.
   If the fallback is missing or incomplete, implement it now:

   ```ts
   export function getGameCopy(slug: string): GameCopy {
     const known = GAME_COPY_MAP[slug];
     if (known) return known;
     // Auto-fallback — no code change needed when new games are seeded
     const name = slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
     return {
       headline: `Buy & Sell ${name} Accounts, Currency & Items`,
       subheadline: `The safest marketplace for ${name} — verified sellers, escrow protection, instant delivery.`,
       whyBuy: `GETX escrow holds your payment until you confirm delivery. Every seller is verified.`,
     };
   }
   ```

   All 10 new games auto-use this fallback — no manual copy entry required unless marketing
   wants custom text. Document this in `docs/DECISIONS.md`.

5. **SEO — game pages and sitemap**

   **a. Game detail page — `src/app/(shop)/games/[slug]/page.tsx`**
   - `generateMetadata`: use `getGameCopy(slug).headline` as `title`, `subheadline` as
     `description`. If the game is inactive or not found, `notFound()`.
   - `generateStaticParams`: return only `isActive: true` games (so inactive games are never
     pre-rendered; they 404 at request time via the `notFound()` guard).

   **b. Sitemap — `src/app/sitemap.ts` (or `sitemap.xml/route.ts`)**
   - Confirm the sitemap already queries `prisma.game.findMany({ where: { isActive: true } })`
     for game entries. If it uses a static array, migrate it to a dynamic DB query now.
   - Each active game slug → `https://getx.live/games/<slug>` with `changefreq: "weekly"`,
     `priority: 0.8`.
   - After a toggle-inactive, `revalidatePath("/sitemap.xml")` (called in the Server Action above)
     ensures the next request regenerates the sitemap without a deploy.

   **c. Browse / homepage queries**
   - Wherever games are fetched for the homepage "Browse by Game" section or `/games` browse page,
     add `where: { isActive: true }` and `orderBy: { sortOrder: "asc" }`.
   - Verify `src/server/services/marketplace.ts` (or wherever the games list query lives) applies
     these filters. Update it if not.

6. **Game images via R2**

   Images live at `<R2_PUBLIC_URL>/games/<slug>.webp` in the existing public R2 bucket (the same
   bucket provisioned in Step 12). No new bucket, no new presign flow needed — these are public
   static assets, not user uploads.

   - Confirm `next.config.ts` (or `next.config.mjs`) already has `remotePatterns` covering the
     R2 public hostname. If not, add it now.
   - In the admin create/edit form: show a live `<Image>` preview of the `imageUrl` field value
     using `next/image` (with a graceful fallback placeholder if the URL 404s — use
     `onError` to swap to a local `/placeholder-game.webp`).
   - No upload UI needed here — images are uploaded directly to R2 by the admin outside the app
     (e.g., via the R2 dashboard or `rclone`). The CMS stores only the URL.

7. **`sortOrder` respected on homepage + browse**

   - Homepage "Browse by Game" grid: `orderBy: { sortOrder: "asc" }`, `where: { isActive: true }`.
   - `/games` browse/all-games page: same ordering.
   - Admin list page shows the current `sortOrder` value and admins can edit it via the game
     edit form (integer field, ≥ 0). No drag-and-drop required at MVP.

8. **Edge cases**

   - **Duplicate slug on create**: Prisma P2002 unique constraint → catch outside transaction,
     surface as a Zod-style field error ("Slug already taken") on the form. Never crash.
   - **Inactive game → public 404**: `src/app/(shop)/games/[slug]/page.tsx` must call
     `notFound()` if `game.isActive === false`. Listings under that game remain in the DB but
     are unreachable via normal browse paths — they will naturally disappear from search because
     `marketplace.ts` filters `isActive: true` games.
   - **Seed re-run idempotency**: all `upsert` calls use `where: { slug }` so running
     `npm run db:seed` twice never duplicates rows or crashes.
   - **Missing R2_PUBLIC_URL in seed**: fall back to the string `"https://r2.getx.live"` so the
     seed completes without throwing; log a warning to stderr.
   - **Category sync on edit**: if an admin removes ITEM from an existing game that already has
     live listings of kind ITEM, do NOT delete those listings — only prevent new ones by removing
     the Category row. Add a warning in the edit UI: "Removing a category does not delete existing
     listings."
   - **Toggle with active listings**: toggling a game inactive while it has ACTIVE listings is
     allowed (admin decision). The listings remain in the DB; buyers navigating directly to a
     listing URL will still see it (listing page does not check `game.isActive`). Document this
     intentional design choice in `docs/DECISIONS.md`.
   - **`generateStaticParams` for inactive game**: must never include inactive slugs. The
     `notFound()` guard in the page handles any stale cached slug at request time.
   - **Sitemap cache**: `revalidatePath("/sitemap.xml")` called from toggle + upsert actions
     ensures the Next.js data cache is invalidated; no stale sitemap after an admin action.

9. **QA harness — `scripts/qa-step30.ts`**

   Follow the repo convention: real services against the dev DB, `ok()`/`threw()` helpers,
   test-created data cleaned up in `finally`. Test cases must cover:

   - All 15 games exist in the DB (`prisma.game.count() === 15`).
   - Each game has at least 2 associated `Category` rows.
   - All 15 active game slugs appear in the sitemap response (fetch `/sitemap.xml` locally,
     parse XML, assert each slug present).
   - Admin create: POST to the `upsertGameAction` via direct service call → game row created,
     categories created, `AuditLog` row written.
   - Admin edit: update `description` + `sortOrder` → DB reflects changes, `AuditLog` written.
   - Toggle inactive: `game.isActive` flips to `false`; fetching `/games/<slug>` returns 404
     (or `notFound()` path triggered); game absent from the active games list.
   - Toggle back to active: `game.isActive` flips to `true`; game reappears in active list.
   - Duplicate slug: `upsertGameAction` in create mode with an existing slug surfaces P2002 as
     a validation error, does not crash.
   - `sortOrder` ordering: fetch active games list, assert returned array is sorted ascending by
     `sortOrder`.
   - `getGameCopy` fallback: call with a slug not in `GAME_COPY_MAP`, assert returned object has
     non-empty `headline`, `subheadline`, `whyBuy` strings.

### Rules

- **No DB queries in React components or page files**: all game data access goes through
  `src/server/services/admin.ts` (admin queries) or `src/server/services/marketplace.ts`
  (public queries). Pages call these services only.
- **Every admin mutation writes an `AuditLog`**: create, edit, and toggle all require an
  `AuditLog` row with `adminId` and a details JSON. No silent mutations.
- **Seed must be idempotent**: `upsert` on slug for every game and category row. Running the
  seed twice must produce identical DB state with zero errors.
- **Inactive games are hard-404 on the public site**: `notFound()` called in the game page when
  `isActive === false`; excluded from all browse queries, homepage grids, and the sitemap.

### Report back

CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST

- [ ] `prisma migrate deploy` succeeds; `Game.sortOrder` column exists; `@@index([isActive, sortOrder])` present
- [ ] `npm run db:seed` (or `npx tsx prisma/seed.ts`) completes without errors; 15 games in DB; re-run is idempotent
- [ ] Each of the 10 new games has ≥ 2 `Category` rows in the DB
- [ ] All 15 game slugs browsable at `/games/[slug]`; correct `<title>` and `<meta description>` rendered
- [ ] `getGameCopy()` fallback returns valid copy for all 10 new slugs (no hard-coded entries needed)
- [ ] Sitemap (`/sitemap.xml`) lists all 15 active game URLs; inactive game absent from sitemap after toggle
- [ ] Homepage "Browse by Game" and `/games` browse page show games sorted by `sortOrder` ascending, active only
- [ ] `/admin/games` list renders with Name, Slug, Categories count, Status badge, Sort Order, Edit + Toggle actions
- [ ] Admin create game: form validates, game + categories created, `AuditLog` written, redirect to list
- [ ] Admin edit game: pre-populated form, save updates DB + `AuditLog`, category sync works without deleting listings
- [ ] Duplicate slug on create: form shows field-level error "Slug already taken", no crash, no partial DB write
- [ ] Toggle inactive: `game.isActive = false`; `/games/<slug>` returns 404; game absent from browse + sitemap
- [ ] Toggle back to active: game reappears in browse, sitemap, and homepage grid
- [ ] Game images reference correct R2 URL pattern; `next/image` `remotePatterns` covers R2 hostname; placeholder shown on 404
- [ ] `scripts/qa-step30.ts` runs via `npx tsx scripts/qa-step30.ts` — all assertions pass
- [ ] `typecheck` / `lint` / `build` pass; admin CMS and game pages are mobile responsive
- [ ] Step 30 ticked in `docs/ROADMAP.md`; key decisions (fallback copy strategy, inactive-toggle behaviour, category sync policy) logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step

Move to **Step 31 — Observability**: wire Sentry performance tracing, set up error alerting rules,
add structured logging for order/payment/escrow events, and create a basic uptime monitor — so
production issues surface before users complain.

## 🔑 Tokens needed: **None** (uses existing R2 public bucket from Step 12).
