-- Step 27 — Community: guides, leaderboards, badges.
-- (SellerProfile timestamp drift from `migrate diff` deliberately excluded — pre-existing, unrelated.)

-- CreateEnum
CREATE TYPE "BadgeAwardedBy" AS ENUM ('SYSTEM', 'ADMIN');

-- CreateTable
CREATE TABLE "Guide" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuideView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuideLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconUrl" TEXT NOT NULL,
    CONSTRAINT "Badge_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeCode" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "awardedBy" "BadgeAwardedBy" NOT NULL,
    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guide_slug_key" ON "Guide"("slug");
CREATE INDEX "Guide_gameId_idx" ON "Guide"("gameId");
CREATE INDEX "Guide_authorId_idx" ON "Guide"("authorId");
CREATE INDEX "Guide_published_createdAt_idx" ON "Guide"("published", "createdAt");
CREATE INDEX "GuideView_guideId_idx" ON "GuideView"("guideId");
CREATE UNIQUE INDEX "GuideView_userId_guideId_key" ON "GuideView"("userId", "guideId");
CREATE INDEX "GuideLike_guideId_idx" ON "GuideLike"("guideId");
CREATE UNIQUE INDEX "GuideLike_userId_guideId_key" ON "GuideLike"("userId", "guideId");
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");
CREATE UNIQUE INDEX "UserBadge_userId_badgeCode_key" ON "UserBadge"("userId", "badgeCode");

-- AddForeignKey
ALTER TABLE "Guide" ADD CONSTRAINT "Guide_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Guide" ADD CONSTRAINT "Guide_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuideView" ADD CONSTRAINT "GuideView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuideView" ADD CONSTRAINT "GuideView_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuideLike" ADD CONSTRAINT "GuideLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuideLike" ADD CONSTRAINT "GuideLike_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeCode_fkey" FOREIGN KEY ("badgeCode") REFERENCES "Badge"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
