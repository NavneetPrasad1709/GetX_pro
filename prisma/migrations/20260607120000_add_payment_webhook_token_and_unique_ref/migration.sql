-- Step 09 (payments): CoinGate callback verification token + race-safe webhook lookup.
-- The plain (provider, providerRef) index becomes a UNIQUE constraint — a webhook
-- maps to exactly one Payment row; Postgres allows multiple NULL providerRefs.

-- DropIndex
DROP INDEX "Payment_provider_providerRef_idx";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "webhookToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON "Payment"("provider", "providerRef");
