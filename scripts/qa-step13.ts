/**
 * Step 13 QA harness — reviews & ratings. Exercises the REAL service against the
 * live dev DB: eligibility (buyer of a COMPLETED order only), one-per-order,
 * self-review block, aggregate recompute, edit, profanity guard, seller reply,
 * and paginated feeds. Run: npx tsx scripts/qa-step13.ts (marked data, cleaned up).
 */
import { db } from "../src/lib/db";
import { containsProfanity } from "../src/lib/profanity";
import {
  createReview,
  editReview,
  getOrderReviewContext,
  getSellerActiveListings,
  getSellerPublicProfile,
  getSellerReviews,
  replyToReview,
} from "../src/server/services/reviews";

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
async function threw(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const stamp = Date.now();
  const emails = {
    buyer: `qa13-buyer-${stamp}@test.getx.live`,
    seller: `qa13-seller-${stamp}@test.getx.live`,
    stranger: `qa13-stranger-${stamp}@test.getx.live`,
  };
  const buyer = await db.user.create({ data: { email: emails.buyer, name: "QA13 Buyer", emailVerified: new Date() } });
  const stranger = await db.user.create({ data: { email: emails.stranger, name: "QA13 Stranger", emailVerified: new Date() } });
  const sellerUser = await db.user.create({ data: { email: emails.seller, name: "QA13 Seller User", emailVerified: new Date() } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, displayName: "QA13 Store" } });
  const game = await db.game.findFirstOrThrow({ include: { categories: true } });
  const cat = game.categories[0];

  const mkListing = (slug: string) =>
    db.listing.create({
      data: {
        sellerId: seller.id,
        gameId: game.id,
        categoryId: cat.id,
        type: cat.kind,
        title: `QA13 ${slug}`,
        slug,
        description: "QA13 listing for review testing.",
        priceMinor: 100000,
        currency: "INR",
        stock: 1,
        status: "ACTIVE",
        attributes: {},
      },
    });

  const mkOrder = async (slug: string, status: "COMPLETED" | "PAID", buyerUserId = buyer.id) => {
    const listing = await mkListing(slug);
    const order = await db.order.create({
      data: {
        buyerId: buyerUserId,
        sellerId: seller.id,
        listingId: listing.id,
        qty: 1,
        unitPriceMinor: 100000,
        feeMinor: 5000,
        sellerFeeMinor: 8000,
        totalMinor: 105000,
        currency: "INR",
        status,
      },
    });
    return { listing, order };
  };

  const freshSeller = () => db.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } });

  try {
    console.log("\n— profanity guard (unit) —");
    ok("flags 'this is shit'", containsProfanity("this is shit"));
    ok("flags leet 'sh1t'", containsProfanity("what a sh1t deal"));
    ok("clean text passes", !containsProfanity("great seller, fast delivery, highly recommend"));
    ok("no Scunthorpe false-positive", !containsProfanity("I live near Scunthorpe and Penistone"));

    console.log("\n— eligibility —");
    const a = await mkOrder(`qa13-a-${stamp}`, "COMPLETED");
    const notBuyer = await threw(() => createReview(stranger.id, a.order.id, 5, "nice"));
    ok("non-buyer cannot review (Order not found)", notBuyer === "Order not found.");

    const notDone = await mkOrder(`qa13-paid-${stamp}`, "PAID");
    const tooEarly = await threw(() => createReview(buyer.id, notDone.order.id, 5, "nice"));
    ok("cannot review a non-COMPLETED order", tooEarly?.includes("completed") === true, tooEarly ?? "");

    const ctxBefore = await getOrderReviewContext(buyer.id, a.order.id);
    ok("getOrderReviewContext: canReview before, no existing", ctxBefore.canReview && ctxBefore.existing === null);

    await createReview(buyer.id, a.order.id, 5, "Smooth and fast, exactly as described.");
    ok("review created → seller ratingAvg 5, count 1", (await freshSeller()).ratingCount === 1 && (await freshSeller()).ratingAvg === 5);

    const dup = await threw(() => createReview(buyer.id, a.order.id, 4, "again"));
    ok("one review per order enforced", dup?.includes("already reviewed") === true, dup ?? "");

    const ctxAfter = await getOrderReviewContext(buyer.id, a.order.id);
    ok("getOrderReviewContext: existing after review, canReview false", !ctxAfter.canReview && ctxAfter.existing?.rating === 5);

    console.log("\n— self-review block (crafted order) —");
    const self = await mkOrder(`qa13-self-${stamp}`, "COMPLETED", sellerUser.id); // buyer == seller's user
    const selfReview = await threw(() => createReview(sellerUser.id, self.order.id, 5, "love my own"));
    ok("seller cannot review their own sale", selfReview?.includes("your own sale") === true, selfReview ?? "");

    console.log("\n— profanity blocked on submit —");
    const b = await mkOrder(`qa13-b-${stamp}`, "COMPLETED");
    const dirty = await threw(() => createReview(buyer.id, b.order.id, 4, "this seller is a bastard"));
    ok("profane comment rejected", dirty?.includes("inappropriate language") === true, dirty ?? "");
    ok("no review row written for the rejected attempt", (await db.review.count({ where: { orderId: b.order.id } })) === 0);

    console.log("\n— aggregate across multiple reviews —");
    await createReview(buyer.id, b.order.id, 4, "good");
    const c = await mkOrder(`qa13-c-${stamp}`, "COMPLETED");
    await createReview(buyer.id, c.order.id, 3, "okay");
    // ratings now: a=5, b=4, c=3 → avg 4, count 3
    const agg = await freshSeller();
    ok("ratingAvg = mean(5,4,3) = 4, count 3", agg.ratingAvg === 4 && agg.ratingCount === 3, `${agg.ratingAvg}/${agg.ratingCount}`);

    console.log("\n— edit recomputes the aggregate —");
    const reviewC = await db.review.findFirstOrThrow({ where: { orderId: c.order.id } });
    await editReview(buyer.id, reviewC.id, 5, "actually great after support helped");
    const agg2 = await freshSeller();
    ok("after edit c 3→5: avg = mean(5,4,5) ≈ 4.667, count still 3", Math.abs(agg2.ratingAvg - 14 / 3) < 0.001 && agg2.ratingCount === 3, `${agg2.ratingAvg}`);
    const notOwnerEdit = await threw(() => editReview(stranger.id, reviewC.id, 1, "hijack"));
    ok("non-owner cannot edit a review", notOwnerEdit === "Review not found.");

    console.log("\n— seller reply —");
    const strangerReply = await threw(() => replyToReview(stranger.id, reviewC.id, "thanks!"));
    ok("non-seller cannot reply", strangerReply === "Review not found.");
    await replyToReview(sellerUser.id, reviewC.id, "Glad it worked out — thanks for the order!");
    const replied = await db.review.findUniqueOrThrow({ where: { id: reviewC.id } });
    ok("seller reply stored with timestamp", replied.sellerReply?.includes("Glad it worked out") === true && replied.sellerReplyAt !== null);
    const profaneReply = await threw(() => replyToReview(sellerUser.id, reviewC.id, "you absolute bastard"));
    ok("profane reply rejected", profaneReply?.includes("inappropriate language") === true);
    // Review fix: the reply is one-time — a clean second reply must be rejected
    // server-side (can't overwrite a polite reply with something hostile later).
    const secondReply = await threw(() => replyToReview(sellerUser.id, reviewC.id, "on second thought, let me change this"));
    ok("seller reply is one-time (second reply rejected)", secondReply?.includes("already replied") === true, secondReply ?? "");

    console.log("\n— feeds: paginated reviews + public profile + listings —");
    const page1 = await getSellerReviews(seller.id, { limit: 2 });
    ok("first page returns 2 + a nextCursor", page1.reviews.length === 2 && page1.nextCursor !== null);
    ok("reviews carry verified-purchase data (rating + reviewer)", page1.reviews[0].rating >= 1 && page1.reviews[0].reviewerName.length > 0);
    ok("edited review flagged as edited", (await getSellerReviews(seller.id, { limit: 50 })).reviews.find((r) => r.id === reviewC.id)?.edited === true);
    const page2 = await getSellerReviews(seller.id, { limit: 2, cursor: page1.nextCursor! });
    ok("second page continues (no overlap)", page2.reviews.length >= 1 && !page2.reviews.some((r) => page1.reviews.some((p) => p.id === r.id)));

    const profile = await getSellerPublicProfile(seller.id);
    ok("public profile reflects ratingCount 3", profile?.ratingCount === 3 && profile?.displayName === "QA13 Store");
    const activeListings = await getSellerActiveListings(seller.id);
    ok("active listings returned for the profile", activeListings.length >= 1 && activeListings.every((l) => l.id));
    ok("missing seller → null profile", (await getSellerPublicProfile("nonexistentid")) === null);

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    await db.order.deleteMany({ where: { buyer: { email: { in: Object.values(emails) } } } });
    await db.listing.deleteMany({ where: { seller: { user: { email: { in: Object.values(emails) } } } } });
    await db.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await db.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
