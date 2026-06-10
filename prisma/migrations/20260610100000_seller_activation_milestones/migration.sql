-- Seller activation funnel milestones (Prompt 14)
ALTER TABLE "SellerProfile"
  ADD COLUMN "kycSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "firstListingAt" TIMESTAMP(3),
  ADD COLUMN "firstSaleAt"    TIMESTAMP(3);

CREATE INDEX "SellerProfile_kycSubmittedAt_idx" ON "SellerProfile"("kycSubmittedAt");
CREATE INDEX "SellerProfile_firstListingAt_idx" ON "SellerProfile"("firstListingAt");
CREATE INDEX "SellerProfile_firstSaleAt_idx"    ON "SellerProfile"("firstSaleAt");

-- Onboarding heuristic: has the seller set a payout method (first payout request)
ALTER TABLE "Wallet"
  ADD COLUMN "payoutMethodSet" BOOLEAN NOT NULL DEFAULT false;
