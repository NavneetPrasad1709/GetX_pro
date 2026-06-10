-- Prompt 08: marketplace "Most popular" sort + "min sales" seller filter.
-- Indexes SellerProfile.totalSales so ORDER BY totalSales DESC and
-- WHERE totalSales >= N use the index instead of a sequential scan.
CREATE INDEX IF NOT EXISTS "SellerProfile_totalSales_idx" ON "SellerProfile"("totalSales");
