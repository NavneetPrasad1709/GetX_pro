-- Step 19: Auto/instant delivery — pre-loaded encrypted DeliveryItem assigned atomically at PAID.
-- Additive only. content is AES-256-GCM encrypted at rest; never plaintext in this table.

-- CreateEnum
CREATE TYPE "DeliveryItemStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'DELIVERED');


-- CreateTable
CREATE TABLE "DeliveryItem" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "DeliveryItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "orderId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryItem_listingId_status_idx" ON "DeliveryItem"("listingId", "status");

-- CreateIndex
CREATE INDEX "DeliveryItem_orderId_idx" ON "DeliveryItem"("orderId");

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

