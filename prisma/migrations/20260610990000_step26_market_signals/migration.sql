-- Step 26 — Demand forecast: daily market aggregation + search log.
-- (SellerProfile timestamp drift from `migrate diff` deliberately excluded — pre-existing, unrelated.)
-- NOTE: model is MarketSignal (NOT DemandSignal — that name is the Prompt-12 demand-capture model).

-- CreateTable
CREATE TABLE "MarketSignal" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "categoryKind" "CategoryKind" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "avgPriceMinor" INTEGER NOT NULL DEFAULT 0,
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "query" VARCHAR(500) NOT NULL,
    "gameId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketSignal_gameId_date_idx" ON "MarketSignal"("gameId", "date");
CREATE INDEX "MarketSignal_categoryKind_date_idx" ON "MarketSignal"("categoryKind", "date");
CREATE UNIQUE INDEX "MarketSignal_gameId_categoryKind_date_key" ON "MarketSignal"("gameId", "categoryKind", "date");
CREATE INDEX "SearchLog_gameId_createdAt_idx" ON "SearchLog"("gameId", "createdAt");
CREATE INDEX "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");

-- AddForeignKey
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
