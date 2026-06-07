/**
 * Step 06 QA harness — exercises the listings SERVICE layer directly
 * (business logic, ownership, state machine, idempotency) against the dev DB.
 * Run: npx tsx scripts/qa-step06.ts   (cleans up after itself)
 */
import { db } from "../src/lib/db";
import { becomeSeller } from "../src/server/services/users";
import {
  createListing,
  getSellerListings,
  getSellerStats,
  removeListing,
  setListingStatus,
  updateListing,
  ListingServiceError,
} from "../src/server/services/listings";
import { ForbiddenError } from "../src/lib/auth";
import { listingFormSchema } from "../src/lib/validators/listing";

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

async function expectError(
  name: string,
  fn: () => Promise<unknown>,
  errClass: new (...args: never[]) => Error,
) {
  try {
    await fn();
    ok(name, false, "(no error thrown)");
  } catch (err) {
    ok(name, err instanceof errClass, `(got ${(err as Error).name}: ${(err as Error).message})`);
  }
}

async function main() {
  const stamp = Date.now();
  const emails = {
    seller: `qa-seller-${stamp}@test.getx.live`,
    attacker: `qa-attacker-${stamp}@test.getx.live`,
    unverified: `qa-unverified-${stamp}@test.getx.live`,
  };

  // --- setup users -------------------------------------------------------
  const sellerUser = await db.user.create({
    data: { email: emails.seller, name: "QA Seller", emailVerified: new Date() },
  });
  const attackerUser = await db.user.create({
    data: { email: emails.attacker, name: "QA Attacker", emailVerified: new Date() },
  });
  const unverifiedUser = await db.user.create({
    data: { email: emails.unverified, name: "QA Unverified" },
  });

  try {
    console.log("\n— become a seller —");
    try {
      await becomeSeller(unverifiedUser.id, { displayName: "Nope Shop" });
      ok("unverified email is blocked from becoming a seller", false);
    } catch (err) {
      ok(
        "unverified email is blocked from becoming a seller",
        (err as Error).message.includes("Verify your email"),
      );
    }

    const profile1 = await becomeSeller(sellerUser.id, {
      displayName: "QA Shop",
      country: "India",
    });
    const profile2 = await becomeSeller(sellerUser.id, {
      displayName: "QA Shop Again",
    });
    ok("becomeSeller is idempotent (same profile id)", profile1.id === profile2.id);

    const wallet = await db.wallet.findUnique({
      where: { sellerProfileId: profile1.id },
    });
    ok("wallet created with profile", !!wallet);

    const roleAfter = await db.user.findUnique({
      where: { id: sellerUser.id },
      select: { role: true },
    });
    ok("role upgraded to SELLER", roleAfter?.role === "SELLER");

    await becomeSeller(attackerUser.id, { displayName: "Attacker Shop" });

    // --- create listings (all 4 types) ------------------------------------
    console.log("\n— create listings —");
    const games = await db.game.findMany({
      where: { isActive: true },
      include: { categories: true },
      orderBy: { sortOrder: "asc" },
    });
    const sellerSession = { id: sellerUser.id, role: "SELLER" as const };
    const attackerSession = { id: attackerUser.id, role: "SELLER" as const };

    const byKind = (kind: string) => {
      for (const g of games) {
        const c = g.categories.find((c) => c.kind === kind);
        if (c) return { gameId: g.id, categoryId: c.id, kind };
      }
      throw new Error(`no category of kind ${kind}`);
    };

    const created: string[] = [];
    for (const kind of ["ACCOUNT", "ITEM", "CURRENCY", "BOOSTING"] as const) {
      const target = byKind(kind);
      const attrs =
        kind === "ACCOUNT"
          ? { level: "42", rank: "Legend", server: "Asia" }
          : kind === "CURRENCY"
            ? { amount: "1000", unit: "Gems" }
            : kind === "BOOSTING"
              ? { currentRank: "Gold", desiredRank: "Diamond", estimatedDays: "7" }
              : { rarity: "Epic" };

      const parsed = listingFormSchema.parse({
        gameId: target.gameId,
        categoryId: target.categoryId,
        type: kind,
        title: `QA ${kind} listing — automated test ${stamp}`,
        description:
          "Automated QA listing created by scripts/qa-step06.ts — it is removed by the same script after assertions complete.",
        price: "499.99",
        stock: 3,
        deliveryType: kind === "CURRENCY" ? "INSTANT" : "MANUAL",
        attributes: attrs,
        publish: kind !== "ITEM", // ITEM stays a draft
      });
      const listing = await createListing(sellerSession, parsed);
      created.push(listing.id);
      ok(
        `${kind}: created, type derived from category, price minor ok`,
        listing.type === kind &&
          listing.priceMinor === 49999 &&
          listing.status === (kind !== "ITEM" ? "ACTIVE" : "DRAFT"),
        `(type=${listing.type} price=${listing.priceMinor} status=${listing.status})`,
      );
      if (kind === "ACCOUNT") {
        const a = listing.attributes as Record<string, unknown>;
        ok(
          "ACCOUNT: attributes saved + coerced",
          a.level === 42 && a.rank === "Legend" && a.server === "Asia",
          JSON.stringify(a),
        );
      }
    }

    // type/category mismatch: client lies about type → category kind wins
    const accountTarget = byKind("ACCOUNT");
    const lied = listingFormSchema.parse({
      gameId: accountTarget.gameId,
      categoryId: accountTarget.categoryId,
      type: "CURRENCY", // lie — schema can't know, service derives from category
      title: `QA lying type listing ${stamp}`,
      description:
        "Automated QA listing checking that the listing type is derived from the category server-side.",
      price: "100",
      stock: 1,
      deliveryType: "MANUAL",
      attributes: {},
      publish: false,
    });
    const liedListing = await createListing(sellerSession, lied);
    created.push(liedListing.id);
    ok("client-sent type is ignored (derived from category)", liedListing.type === "ACCOUNT");

    // cross-game category swap must fail
    const otherGame = games.find((g) => g.id !== accountTarget.gameId)!;
    await expectError(
      "category from another game is rejected",
      () =>
        createListing(sellerSession, {
          ...lied,
          gameId: otherGame.id, // category belongs to accountTarget.gameId
        }),
      ListingServiceError,
    );

    // --- ownership ---------------------------------------------------------
    console.log("\n— ownership —");
    const victimListingId = created[0];
    await expectError(
      "non-owner cannot edit",
      () => updateListing(attackerSession, victimListingId, lied),
      ForbiddenError,
    );
    await expectError(
      "non-owner cannot pause",
      () => setListingStatus(attackerSession, victimListingId, "pause"),
      ForbiddenError,
    );
    await expectError(
      "non-owner cannot remove",
      () => removeListing(attackerSession, victimListingId),
      ForbiddenError,
    );

    // --- state machine -----------------------------------------------------
    console.log("\n— state machine —");
    const paused = await setListingStatus(sellerSession, victimListingId, "pause");
    ok("ACTIVE → PAUSED", paused.status === "PAUSED");
    await expectError(
      "pausing a paused listing fails",
      () => setListingStatus(sellerSession, victimListingId, "pause"),
      ListingServiceError,
    );
    const resumed = await setListingStatus(sellerSession, victimListingId, "activate");
    ok("PAUSED → ACTIVE", resumed.status === "ACTIVE");

    const removed = await removeListing(sellerSession, created[1]);
    ok("soft delete → REMOVED (row still exists)", removed.status === "REMOVED");
    await expectError(
      "editing a REMOVED listing fails",
      () => updateListing(sellerSession, created[1], lied),
      ListingServiceError,
    );

    // price update via string math
    const updated = await updateListing(sellerSession, victimListingId, {
      ...lied,
      price: 123456 as never, // parsed value is minor units (schema output)
    });
    ok("update writes new price minor", updated.priceMinor === 123456);

    // --- reads ---------------------------------------------------------------
    console.log("\n— reads —");
    const rows = await getSellerListings(sellerUser.id);
    ok(
      "manage list excludes REMOVED",
      rows.every((r) => r.status !== "REMOVED") &&
        rows.some((r) => r.id === victimListingId),
    );
    const stats = await getSellerStats(sellerUser.id);
    ok(
      "stats: counts + ledger-derived wallet 0",
      stats.walletBalanceMinor === 0 && stats.activeListings >= 1,
      JSON.stringify(stats),
    );

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    // --- cleanup -----------------------------------------------------------
    await db.listing.deleteMany({
      where: { seller: { user: { email: { in: Object.values(emails) } } } },
    });
    await db.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await db.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
