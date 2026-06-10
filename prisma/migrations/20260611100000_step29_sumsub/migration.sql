-- Step 29 — Sumsub automated KYC: applicant id + review timestamp on User.
-- (SellerProfile timestamp drift from `migrate diff` deliberately excluded — pre-existing, unrelated.)

-- AlterTable
ALTER TABLE "User" ADD COLUMN "sumsubApplicantId" TEXT,
ADD COLUMN "sumsubReviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_sumsubApplicantId_idx" ON "User"("sumsubApplicantId");
