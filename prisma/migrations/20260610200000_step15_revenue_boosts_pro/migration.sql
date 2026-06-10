-- Revenue optimization: featured boosts + GETX Pro (Prompt 15, high-priority batch)

-- New ledger reasons (opt-in monetization fees → PLATFORM wallet)
ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'BOOST_FEE';
ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_FEE';

-- Seller subscription tier
DO $$ BEGIN
  CREATE TYPE "SellerSubscriptionTier" AS ENUM ('FREE', 'PRO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Listing: paid featured placement (Stream 1/2)
ALTER TABLE "Listing"
  ADD COLUMN "isFeatured"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "boostExpiresAt" TIMESTAMP(3);

CREATE INDEX "Listing_isFeatured_boostExpiresAt_idx"
  ON "Listing"("isFeatured", "boostExpiresAt");

-- SellerProfile: GETX Pro subscription (Stream 4)
ALTER TABLE "SellerProfile"
  ADD COLUMN "subscriptionTier"      "SellerSubscriptionTier" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3);

CREATE INDEX "SellerProfile_subscriptionTier_subscriptionExpiresAt_idx"
  ON "SellerProfile"("subscriptionTier", "subscriptionExpiresAt");
