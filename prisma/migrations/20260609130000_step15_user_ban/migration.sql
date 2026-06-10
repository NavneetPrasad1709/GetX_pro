-- Step 15 (admin): a `bannedAt` timestamp on User (set by admins; a banned user
-- can't log in or act). Also drops the Step-13 backfill DEFAULT on Review.updatedAt
-- — Prisma's @updatedAt manages that column in-app, so the DB default is unneeded
-- (this just realigns the DB with the schema; harmless either way).

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bannedAt" TIMESTAMP(3);
