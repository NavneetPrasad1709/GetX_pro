-- Step 19: Founder analytics cockpit — read-side indexes for fast aggregation.
-- All additive (CREATE INDEX only). No data change.

-- LedgerEntry: platform revenue aggregation (walletId='platform', reason='FEE', type='CREDIT', by day)
CREATE INDEX "LedgerEntry_walletId_reason_type_createdAt_idx" ON "LedgerEntry"("walletId", "reason", "type", "createdAt");

-- Order: GMV-by-date aggregation + funnel counts
CREATE INDEX "Order_status_updatedAt_idx" ON "Order"("status", "updatedAt");

-- Order: game/category revenue join (listing -> order, COMPLETED, in window)
CREATE INDEX "Order_listingId_status_updatedAt_idx" ON "Order"("listingId", "status", "updatedAt");

-- SellerProfile: seller funnel by signup cohort
CREATE INDEX "SellerProfile_kycStatus_createdAt_idx" ON "SellerProfile"("kycStatus", "createdAt");
