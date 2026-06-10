-- Revenue streams 3/5/6/7 (Prompt 15b): Sponsored sellers, Shield, Instant payout, Bumps

ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'INSTANT_PAYOUT_FEE';

-- Stream 3: Spotlight sponsorship
ALTER TABLE "SellerProfile"
  ADD COLUMN "isSponsored"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sponsorshipExpiresAt" TIMESTAMP(3);
CREATE INDEX "SellerProfile_isSponsored_sponsorshipExpiresAt_idx"
  ON "SellerProfile"("isSponsored", "sponsorshipExpiresAt");

-- Stream 5: Shield buyer protection
ALTER TABLE "Order"
  ADD COLUMN "hasShield"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shieldFeeMinor" INTEGER NOT NULL DEFAULT 0;

-- Stream 6: Instant payout
ALTER TABLE "Payout"
  ADD COLUMN "isInstant"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "instantFeeMinor" INTEGER NOT NULL DEFAULT 0;

-- Stream 7: Listing bumps
ALTER TABLE "Listing"
  ADD COLUMN "bumpedAt"   TIMESTAMP(3),
  ADD COLUMN "bumpCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastBumpAt" TIMESTAMP(3);
