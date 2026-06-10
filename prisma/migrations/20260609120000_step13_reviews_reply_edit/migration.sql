-- Step 13 (reviews): optional one-time seller reply + edit tracking, and a
-- (sellerId, createdAt) index for the seller-profile / listing review feeds.
-- `updatedAt` is NOT NULL; CURRENT_TIMESTAMP safely backfills any existing rows,
-- and Prisma's @updatedAt manages it from here on.

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "sellerReply" TEXT,
ADD COLUMN     "sellerReplyAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Review_sellerId_createdAt_idx" ON "Review"("sellerId", "createdAt");
