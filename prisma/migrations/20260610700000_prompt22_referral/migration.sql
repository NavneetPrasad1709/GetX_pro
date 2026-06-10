-- Prompt 22: Referral & viral growth engine (fraud-safe double-sided referral core).
-- Additive only. Reward currency is the FEE_CREDIT fallback (User.referralCreditMinor) until
-- Step 21 loyalty points exist. The affiliate/streamer layer is deferred (not in this migration).

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'COMPLETED', 'VOIDED');
CREATE TYPE "ReferralKind" AS ENUM ('BUYER', 'SELLER');
CREATE TYPE "ReferralRewardType" AS ENUM ('LOYALTY_POINTS', 'FEE_CREDIT');

-- AlterEnum: new notification category for referral rewards
ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL';

-- AlterTable: User referral fields
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referralCreditMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referredBy" TEXT;

-- CreateTable: Referral
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "kind" "ReferralKind" NOT NULL DEFAULT 'BUYER',
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "bonusAwarded" BOOLEAN NOT NULL DEFAULT false,
    "rewardType" "ReferralRewardType" NOT NULL DEFAULT 'FEE_CREDIT',
    "referrerRewardAmount" INTEGER NOT NULL DEFAULT 0,
    "refereeRewardAmount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");
CREATE INDEX "Referral_status_idx" ON "Referral"("status");
CREATE INDEX "Referral_referrerId_status_idx" ON "Referral"("referrerId", "status");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
