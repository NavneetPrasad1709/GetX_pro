-- Liquidity metrics (Prompt 12)

-- Listing: liquidity tracking fields
ALTER TABLE "Listing"
  ADD COLUMN "viewCount"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastActivityAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "expiresAt"           TIMESTAMP(3),
  ADD COLUMN "newSellerBoostUntil" TIMESTAMP(3);

-- New-seller boosted sort + stale-listing auto-pause sweep
CREATE INDEX "Listing_gameId_status_newSellerBoostUntil_idx"
  ON "Listing"("gameId", "status", "newSellerBoostUntil");
CREATE INDEX "Listing_status_lastActivityAt_idx"
  ON "Listing"("status", "lastActivityAt");

-- DemandSignal: anonymous demand capture for empty categories
CREATE TABLE "DemandSignal" (
  "id"         TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "gameId"     TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemandSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemandSignal_email_categoryId_key"
  ON "DemandSignal"("email", "categoryId");
CREATE INDEX "DemandSignal_categoryId_idx" ON "DemandSignal"("categoryId");
CREATE INDEX "DemandSignal_gameId_idx"     ON "DemandSignal"("gameId");
CREATE INDEX "DemandSignal_createdAt_idx"  ON "DemandSignal"("createdAt");

ALTER TABLE "DemandSignal"
  ADD CONSTRAINT "DemandSignal_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemandSignal"
  ADD CONSTRAINT "DemandSignal_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
