-- Step 21 — Loyalty points: append-only earn/redeem ledger + order redemption snapshot.
-- (SellerProfile timestamp drift from `migrate diff` deliberately excluded — pre-existing, unrelated.)

-- CreateEnum
CREATE TYPE "LoyaltyPointType" AS ENUM ('EARN', 'REDEEM');

-- CreateEnum
CREATE TYPE "LoyaltyPointReason" AS ENUM ('SIGNUP_BONUS', 'PURCHASE', 'SALE', 'REDEMPTION', 'PURCHASE_REFUND');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LoyaltyPoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "LoyaltyPointType" NOT NULL,
    "reason" "LoyaltyPointReason" NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyPoint_userId_createdAt_idx" ON "LoyaltyPoint"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyPoint_orderId_idx" ON "LoyaltyPoint"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyPoint_userId_orderId_reason_type_key" ON "LoyaltyPoint"("userId", "orderId", "reason", "type");

-- AddForeignKey
ALTER TABLE "LoyaltyPoint" ADD CONSTRAINT "LoyaltyPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyPoint" ADD CONSTRAINT "LoyaltyPoint_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
