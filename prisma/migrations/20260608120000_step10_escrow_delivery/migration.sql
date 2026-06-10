-- Step 10 (escrow + delivery).
--   • OrderDelivery: the seller's hand-over payload (creds/code/notes), 1:1 with an Order.
--   • Wallet gains `kind` (SELLER | PLATFORM); `sellerProfileId` becomes nullable so the
--     single GETX PLATFORM revenue wallet (holds FEE entries on release) can exist with no
--     seller. Existing seller wallets default to kind = SELLER and keep their seller id.

-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('SELLER', 'PLATFORM');

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "kind" "WalletKind" NOT NULL DEFAULT 'SELLER',
ALTER COLUMN "sellerProfileId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OrderDelivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderDelivery_orderId_key" ON "OrderDelivery"("orderId");

-- CreateIndex
CREATE INDEX "Wallet_kind_idx" ON "Wallet"("kind");

-- AddForeignKey
ALTER TABLE "OrderDelivery" ADD CONSTRAINT "OrderDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
