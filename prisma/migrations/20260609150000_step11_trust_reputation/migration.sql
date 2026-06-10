-- Trust score computation fields (Prompt 11 / Step 17 spec)
ALTER TABLE "SellerProfile"
  ADD COLUMN "trustScoreBreakdown"   JSONB,
  ADD COLUMN "trustScoreUpdatedAt"   TIMESTAMPTZ,
  ADD COLUMN "trustScoreOverride"    BOOLEAN NOT NULL DEFAULT FALSE,

-- Seller level fields (BRONZE..ELITE; String not enum so thresholds can change in code)
  ADD COLUMN "sellerLevel"           TEXT NOT NULL DEFAULT 'BRONZE',
  ADD COLUMN "sellerLevelUpdatedAt"  TIMESTAMPTZ,

-- Scam-risk sub-score (0-100; high = more risk; feeds Fraud Radar, Prompt 16)
  ADD COLUMN "riskScore"             INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "riskScoreUpdatedAt"    TIMESTAMPTZ;

-- Indexes for marketplace filters/sorts
CREATE INDEX "SellerProfile_sellerLevel_idx" ON "SellerProfile"("sellerLevel");
CREATE INDEX "SellerProfile_riskScore_idx"   ON "SellerProfile"("riskScore");
