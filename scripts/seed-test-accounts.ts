/**
 * Creates the Step 03 test accounts (idempotent — safe to re-run):
 *   test.buyer@getx.live  / GetxTest123  (BUYER, verified)
 *   test.seller@getx.live / GetxTest123  (SELLER, verified, shop + wallet)
 *   test.admin@getx.live  / GetxTest123  (ADMIN, verified)
 * Run: npx tsx --env-file=.env scripts/seed-test-accounts.ts
 */
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { becomeSeller } from "../src/server/services/users";

const PASSWORD = "GetxTest123";

async function ensureUser(
  email: string,
  name: string,
  role: "BUYER" | "SELLER" | "ADMIN",
) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  return db.user.upsert({
    where: { email },
    create: { email, name, passwordHash, emailVerified: new Date(), role },
    update: { emailVerified: new Date() }, // keep idempotent, don't reset password
  });
}

async function main() {
  const buyer = await ensureUser("test.buyer@getx.live", "Test Buyer", "BUYER");
  console.log(`buyer  ok: ${buyer.email} (${buyer.role})`);

  const seller = await ensureUser(
    "test.seller@getx.live",
    "Test Seller",
    "BUYER", // upgraded by becomeSeller below (the real flow)
  );
  const hasProfile = await db.sellerProfile.findUnique({
    where: { userId: seller.id },
  });
  if (!hasProfile) {
    await becomeSeller(seller.id, {
      displayName: "Test Seller Shop",
      bio: "Step 03 QA seller account",
    });
  }
  const sellerAfter = await db.user.findUnique({ where: { id: seller.id } });
  console.log(`seller ok: ${sellerAfter?.email} (${sellerAfter?.role})`);

  const admin = await ensureUser("test.admin@getx.live", "Test Admin", "ADMIN");
  // upsert.update doesn't touch role — force it for pre-existing rows
  await db.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  console.log(`admin  ok: ${admin.email} (ADMIN)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
