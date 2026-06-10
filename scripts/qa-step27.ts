/**
 * Step 27 QA — Community (badges + guides + leaderboard). Drives the REAL services against the dev DB:
 * badge idempotency + milestone awards, guide auto-publish vs draft, view-count idempotency (+ author
 * exclusion), like toggle, published-delete block, slug uniqueness, leaderboard ordering. Cleans up
 * in finally (the 5 seeded badges are left intact). Run: npx tsx scripts/qa-step27.ts
 */
import { db } from "../src/lib/db";
import { createListing } from "../src/server/services/listings";
import {
  awardBadge,
  checkAndAwardMilestoneBadges,
  getUserBadges,
} from "../src/server/services/badges";
import {
  createGuide,
  toggleLike,
  incrementViewCount,
  publishGuide,
  deleteGuide,
  getGameLeaderboard,
  getGuideBySlug,
} from "../src/server/services/guides";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}
async function threw(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const stamp = Date.now();
  const authorUser = await db.user.create({ data: { email: `qa27-a-${stamp}@test.getx.live`, name: "QA27 Author", role: "SELLER", emailVerified: new Date(), emailNotifications: false } });
  const viewer = await db.user.create({ data: { email: `qa27-v-${stamp}@test.getx.live`, name: "QA27 Viewer", emailVerified: new Date(), emailNotifications: false } });
  const buyer = await db.user.create({ data: { email: `qa27-b-${stamp}@test.getx.live`, name: "QA27 Buyer", emailVerified: new Date(), emailNotifications: false } });
  // Backdated createdAt so "first 50 sellers" is deterministically true for this seller.
  const seller = await db.sellerProfile.create({ data: { userId: authorUser.id, displayName: "QA27 Store", kycStatus: "APPROVED", createdAt: new Date("2020-01-01") } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  const guideIds: string[] = [];
  let listingId = "";
  const orderIds: string[] = [];

  try {
    console.log("\n=== badges: seed + idempotency + milestones ===");
    ok("5 badges seeded", (await db.badge.count()) >= 5);
    await awardBadge(authorUser.id, "COMMUNITY_HERO", "ADMIN");
    await awardBadge(authorUser.id, "COMMUNITY_HERO", "ADMIN");
    ok("awardBadge idempotent (1 row after 2 calls)", (await db.userBadge.count({ where: { userId: authorUser.id, badgeCode: "COMMUNITY_HERO" } })) === 1);

    await checkAndAwardMilestoneBadges(authorUser.id, 500);
    const badges = await getUserBadges(authorUser.id);
    const codes = badges.map((b) => b.badgeCode);
    ok("TRUSTED_VETERAN awarded at 500 sales", codes.includes("TRUSTED_VETERAN"));
    ok("EARLY_SELLER awarded (within first 50, backdated)", codes.includes("EARLY_SELLER"));
    ok("getUserBadges is oldest-first", badges.length >= 2 && badges[0].awardedAt <= badges[1].awardedAt);

    console.log("\n=== guides: draft vs auto-publish ===");
    await db.sellerProfile.update({ where: { id: seller.id }, data: { totalSales: 0 } });
    const draft = await createGuide({ title: `QA27 Rookie Guide ${stamp}`, gameId: game.id, content: "x".repeat(150) }, authorUser.id);
    guideIds.push(draft.id);
    ok("non-veteran guide is a DRAFT", draft.published === false);

    await db.sellerProfile.update({ where: { id: seller.id }, data: { totalSales: 500 } });
    const live = await createGuide({ title: `QA27 Veteran Guide ${stamp}`, gameId: game.id, content: "y".repeat(150) }, authorUser.id);
    guideIds.push(live.id);
    ok("veteran guide AUTO-PUBLISHES", live.published === true);
    ok("GUIDE_AUTHOR badge awarded on auto-publish", (await db.userBadge.count({ where: { userId: authorUser.id, badgeCode: "GUIDE_AUTHOR" } })) === 1);
    ok("two same-base titles get distinct slugs", draft.slug !== live.slug);
    ok("getGuideBySlug round-trips", (await getGuideBySlug(live.slug))?.id === live.id);

    console.log("\n=== views (idempotent + author excluded) ===");
    await incrementViewCount(draft.id, viewer.id);
    await incrementViewCount(draft.id, viewer.id); // same user again
    ok("unique view counted once", (await db.guide.findUniqueOrThrow({ where: { id: draft.id } })).viewCount === 1);
    await incrementViewCount(draft.id, authorUser.id); // author views own guide
    ok("author view does NOT inflate count", (await db.guide.findUniqueOrThrow({ where: { id: draft.id } })).viewCount === 1);

    console.log("\n=== likes (toggle) ===");
    const l1 = await toggleLike(draft.id, viewer.id);
    ok("first like → liked true, count 1", l1.liked === true && (await db.guide.findUniqueOrThrow({ where: { id: draft.id } })).likeCount === 1);
    const l2 = await toggleLike(draft.id, viewer.id);
    ok("second toggle → liked false, count 0", l2.liked === false && (await db.guide.findUniqueOrThrow({ where: { id: draft.id } })).likeCount === 0);

    console.log("\n=== publish + delete guard ===");
    await publishGuide(draft.id);
    ok("publishGuide sets published true", (await db.guide.findUniqueOrThrow({ where: { id: draft.id } })).published === true);
    ok("deleting a PUBLISHED guide is blocked", await threw(() => deleteGuide(draft.id, authorUser.id)));
    // unpublish then delete the rookie draft is allowed (cleanup handles the rest)

    console.log("\n=== leaderboard ===");
    await createListing({ id: authorUser.id, role: "SELLER" }, { gameId: game.id, categoryId: cat.id, type: cat.kind, title: `QA27 Listing ${stamp}`, description: "Leaderboard QA.", price: 100000, stock: 50, deliveryType: "MANUAL", attributes: {}, images: [], publish: true });
    const listing = await db.listing.findFirstOrThrow({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    listingId = listing.id;
    for (let i = 0; i < 2; i++) {
      const o = await db.order.create({ data: { buyerId: buyer.id, sellerId: seller.id, listingId, qty: 1, unitPriceMinor: 100000, feeMinor: 5000, sellerFeeMinor: 8000, totalMinor: 105000, currency: "INR", status: "COMPLETED" } });
      orderIds.push(o.id);
    }
    const board = await getGameLeaderboard(game.id, 10);
    const me = board.find((r) => r.sellerId === seller.id);
    ok("seller appears on the game leaderboard", me !== undefined);
    ok("leaderboard counts the 2 completed sales", (me?.completedSales ?? 0) >= 2, `got ${me?.completedSales}`);
  } finally {
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    if (listingId) await db.listing.deleteMany({ where: { id: listingId } });
    await db.guide.deleteMany({ where: { id: { in: guideIds } } }); // cascades views + likes
    await db.userBadge.deleteMany({ where: { userId: authorUser.id } });
    await db.sellerProfile.deleteMany({ where: { id: seller.id } });
    await db.user.deleteMany({ where: { id: { in: [authorUser.id, viewer.id, buyer.id] } } });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 27 QA — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
