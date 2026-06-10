-- Step 22: Notification system
-- Adds the NotificationType enum, upgrades the Notification model (fast `read` flag,
-- deep `link`, bounded title/body, unread + feed indexes) and a global email opt-out on User.
-- Additive + in-place type change only — no existing column is dropped. The Notification.type
-- String -> enum conversion uses a USING cast (safe; the table is empty at this point and the
-- cast is value-preserving for any valid enum member).

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_UPDATE', 'NEW_MESSAGE', 'DISPUTE', 'PAYOUT', 'REVIEW', 'SYSTEM');

-- AlterTable: Notification — new columns
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT,
ADD COLUMN     "read" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Notification — convert `type` String -> NotificationType in place (no data loss)
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";

-- AlterTable: Notification — bound title/body length
ALTER TABLE "Notification" ALTER COLUMN "title" SET DATA TYPE VARCHAR(80),
ALTER COLUMN "body" SET DATA TYPE VARCHAR(200);

-- AlterTable: User — global email opt-out (defaults on, preserves current behavior)
ALTER TABLE "User" ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
