# Community & Network Effects — Design Spec

> Design spec for the GETX community/ecosystem layer (Audit Prompt 21). **No code is committed by this
> prompt** — it is the buildable blueprint a dev executes phase-by-phase. Five phases ordered by
> retention-ROI per engineering week. Code-grounded + current as of 2026-06-10.
>
> **What changed since the original audit:** the two hardest dependencies are now BUILT —
> `SellerProfile.trustScore` + 5-tier levels are live (Prompt 11), and the **notification system is live**
> (Step 22: in-app bell + Resend email + Socket.io push). So every "notification hook" below is a real
> `notify*()` call today, not a placeholder. `Listing` already has `viewCount`/`lastActivityAt` (Prompt 12).

---

## Thesis

GETX will never have more listings than Eldorado at launch. The winning claim is **"the deeper
community for Pokémon GO."** The reputation graph (reviews + trust score) is the *data* moat; the
community layer is the *stickiness* moat — the thing that makes a trader say "I live here," not "I
shop here." Every social action must deepen switching cost and create a notification hook → repeat
visit → transaction → review → trust → more supply. Target: after one transaction, a user has **≥3
reasons to return before they next need to buy/sell** — (1) new listings from sellers I follow,
(2) the guide I saved, (3) I'm climbing the leaderboard.

---

## Phase 1 — Buyer public profiles + Following (highest immediate retention ROI)

**Schema**
```prisma
model UserProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  handle    String   @unique   // @username, URL-safe [a-z0-9_] 3–20, user-chosen, immutable after 7 days
  publicBio String?  @db.VarChar(280)
  isPublic  Boolean  @default(true)
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Follow {
  id         String   @id @default(cuid())
  followerId String   // User.id (the follower)
  sellerId   String   // SellerProfile.id (followed)
  createdAt  DateTime @default(now())
  @@unique([followerId, sellerId])   // idempotent toggle — prevents double-follow
  @@index([followerId])
  @@index([sellerId, createdAt])      // follower count + "recent followers" for seller dashboard
}
```
- `User` gains `publicHandle`? No — keep identity in `UserProfile` (1:1, lazy-created on first social
  action). Reserve handles: `admin`, `getx`, `support`, `mod`, `api`, `seller`, `buyer`, `null`, etc.
- Handle validation: Zod `^[a-z0-9_]{3,20}$`, DB `@@unique` → friendly "handle already taken" on P2002.

**Engagement loop / network effect:** follow a seller → on their next listing publish, the follower
gets a notification → returns → buys → reviews → seller trust ↑ → ranks higher → more followers.
This is the core flywheel spoke.

**Notification hook (LIVE today via Step 22):** in `createListing` (publish path), after commit,
`void notifyFollowersOfNewListing(sellerId, listing).catch(captureException)` — fan out a
`NEW_LISTING`/`SYSTEM` notification to all `Follow.followerId` for that seller (batch, capped, e.g.
top 500 most-recent followers per publish to bound write amplification; log the cap). Reuse
`createNotification` + the bell. Add a `notifications` config: `maxFollowerFanout`.

**UI:** follow/unfollow button on `/sellers/[id]` (optimistic toggle server action, idempotent on the
`@@unique`); follower count on the profile; a `/following` page = "new listings from sellers you
follow" feed (`Listing where sellerId IN (followed) ORDER BY createdAt DESC`, uses existing
`@@index([sellerId, status])`). Buyer public profile at `/u/[handle]` (reviews written, public
collections, badges) — gated by `isPublic`.

**Abuse controls:** rate-limit follow toggles (per-user, e.g. 60/min); follow fan-out is server-side
only; banned users can't follow; self-follow impossible (follower=User, seller=SellerProfile, block
if `seller.userId === followerId`).

---

## Phase 2 — Wishlists + Collections (highest re-engagement + demand-signal ROI)

**Schema**
```prisma
model WishlistItem {
  id        String   @id @default(cuid())
  userId    String
  listingId String
  createdAt DateTime @default(now())
  @@unique([userId, listingId])     // idempotent save
  @@index([userId, createdAt])       // user's saved list, newest first
  @@index([listingId])               // savedCount demand signal
}

model Collection {
  id        String   @id @default(cuid())
  userId    String
  name      String   @db.VarChar(60)
  isPublic  Boolean  @default(false)
  createdAt DateTime @default(now())
  @@index([userId, isPublic])
}
model CollectionItem {
  id           String  @id @default(cuid())
  collectionId String
  listingId    String? // a saved listing
  sellerId     String? // OR a saved seller (curated lists)
  createdAt    DateTime @default(now())
  @@unique([collectionId, listingId])
  @@unique([collectionId, sellerId])
}
```
- `Listing` demand signal: derive `savedCount` via `WishlistItem` count (or denormalize a counter
  bumped fire-and-forget on save/unsave, like `viewCount`).

**Engagement loop:** Airbnb's research — 34% of bookings start from a wishlist; the "your saved
listing changed price / is back in stock" email is one of the highest-converting re-engagement emails
in marketplace history.

**Notification hooks (LIVE):** when a wishlisted listing (a) drops price or (b) returns to stock
(`status ACTIVE`, `stock > 0` after being 0/SOLD), fan out `ORDER_UPDATE`-style notification +
email to savers. Wire in `updateListing` / the stock-restock path. Cap fan-out; dedupe per
listing-event.

**Demand signal → liquidity:** `savedCount` feeds the admin liquidity dashboard (Prompt 12) and the
founder cockpit (Prompt 19): "most-wished, low-supply" = exactly where to recruit sellers.

**Abuse:** idempotent toggle (`@@unique`); rate-limit; private collections default; `isPublic`
collections respect the owner's `UserProfile.isPublic`.

---

## Phase 3 — Guides + Content (highest SEO + authority ROI — anchors Step 27)

**Schema** (from step-27): `Guide` (slug, title, body Markdown, authorId, gameId, status
DRAFT/PUBLISHED, publishedAt), `GuideView` (dedupe by viewer/day), `GuideLike` (`@@unique([guideId,
userId])`), `GuideReport` (`@@unique([guideId, reporterId])` — one report per user; `@@index([resolvedAt])`
for the admin queue).

**Network effect / SEO:** game-specific guides ("How to safely buy a Level 40 Pokémon GO account",
"Pokémon GO trading price guide 2026") capture long-tail organic search Eldorado doesn't dominate,
and establish GETX as the authority. Ties directly into the Prompt-17 SEO engine (sitemap + JSON-LD
`Article`/`FAQPage`). Badges: `GUIDE_AUTHOR`, `COMMUNITY_HERO`.

**Abuse:** Markdown sanitized server-side (no raw HTML / `dangerouslySetInnerHTML` with user
content); `GuideReport` admin queue; profanity guard (reuse `containsProfanity`); only verified
sellers or trusted users (trust score ≥ threshold) can publish initially.

**Status:** larger build (a mini-CMS) — schedule after Phases 1–2 + leaderboard.

---

## Phase 4 — Leaderboards (highest social-proof + seller-competition ROI)

**Schema:** none new — derive from `Order` + `SellerProfile`. Per-game 30-day leaderboard:
```sql
SELECT o."sellerId", COUNT(*) AS sales, SUM(o."totalMinor") AS gmv
FROM "Order" o JOIN "Listing" l ON l.id = o."listingId"
WHERE o.status = 'COMPLETED' AND o."updatedAt" >= NOW() - INTERVAL '30 days'
  AND l."gameId" = $1
GROUP BY o."sellerId" ORDER BY sales DESC LIMIT 20
```
Uses the new Prompt-19 index `Order [listingId, status, updatedAt]`. Also an all-time board by
`SellerProfile.totalSales` (indexed). Page `/leaderboard` (+ per-game tabs), `unstable_cache`
revalidate 600s, ADMIN-independent (public, social proof). Tie-in: seller levels (Prompt 11) +
badges (`TOP_SELLER`).

**Network effect:** public competition makes sellers list more and respond faster to climb; buyers
trust the top of the board → conversion. Small, high-ROI — **build right after Phases 1–2.**

**Abuse:** read-only aggregation; exclude banned sellers; min-sales floor to avoid noise; cache to
prevent scrape load.

---

## Phase 5 — Communities / Forums + Clans (highest long-term moat, highest ops cost — defer)

**Schema:** `CommunityPost` (gameId, authorId, body, `@@index([gameId, createdAt])`), `Clan`
(name/slug unique, ownerId), `ClanMember` (`@@unique([clanId, userId])`).

**Network effect:** "the place every serious Pokémon GO trader is" = winner-take-most within the
niche. But forums need active moderation (ops cost) and are easy to get wrong empty. **Defer the
forum;** ship Clans (trading guilds) only once there's a critical mass of active sellers. Partial
defer per the audit.

**Abuse:** heavy — spam, scams-in-DMs, off-platform deal solicitation (a marketplace killer). Needs
the Prompt-16 fraud signals + rate limits + report queue + "no off-platform contact" enforcement
before opening. Do NOT launch forums before fraud + moderation tooling is mature.

---

## Cross-cutting: badges, abuse, flywheel, sequencing

**Badges** (`Badge`, `UserBadge` from step-27): `EARLY_SELLER`, `TOP_SELLER`, `TRUSTED_VETERAN`,
`GUIDE_AUTHOR`, `COMMUNITY_HERO`. Awarded by cron/event hooks; displayed on profiles. Earned, not
transferable → switching-cost moat (Layer 3 in `WHY-GETX-WINS.md`).

**Anti-abuse (all phases):** idempotent toggles via `@@unique`; per-user rate limits (reuse
`src/lib/rate-limit.ts`); banned-user gates; server-side fan-out only with hard caps + logged
truncation; sanitized user content (no `dangerouslySetInnerHTML`); profanity guard; report queues
with `@@unique([target, reporter])`; off-platform-contact detection in community surfaces.

**The flywheel:** follow → notification → return → buy → review → trust ↑ → rank ↑ → more followers.
Wishlist → re-engagement email → return → buy. Guide → organic search → new user → follow. Every
spoke compounds and every spoke now has a LIVE notification hook (Step 22).

**Build sequencing (ROI-ordered):**
1. **Phase 1 (Follow + UserProfile)** — bounded; ~1 migration + Follow service + 2 actions + toggle UI +
   `/following` feed + the new-listing follower fan-out (reuses Step 22). Highest retention ROI.
2. **Phase 2 (Wishlist)** — bounded; idempotent save + `/wishlist` + savedCount demand signal +
   price-drop/restock re-engagement hook.
3. **Phase 4 (Leaderboard)** — tiny; one cached query + public page. Big social-proof payoff.
4. **Phase 3 (Guides CMS)** — larger; schedule with Step 27 / SEO.
5. **Phase 5 (Forums/Clans)** — defer until fraud + moderation tooling is mature.

> **Ready to build now:** Phases 1, 2, 4 are bounded and all dependencies (notifications, trust,
> demand signals) are live. Phases 3 and 5 are larger and gated on CMS / moderation investment.
