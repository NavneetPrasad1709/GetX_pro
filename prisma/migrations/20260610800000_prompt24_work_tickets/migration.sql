-- Prompt 24: Marketplace operations — unified WorkTicket queue (SLA-tracked) + TicketNote.
-- Additive only. Money mutations stay in escrow/payout services; this only tracks ticket lifecycle + SLA.

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('DISPUTE', 'KYC', 'FRAUD_FLAG', 'PAYOUT_REVIEW', 'SUPPORT');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING_INFO', 'RESOLVED', 'CLOSED');


-- CreateTable
CREATE TABLE "WorkTicket" (
    "id" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "title" VARCHAR(160) NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "slaDeadlineAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketNote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkTicket_type_status_priority_createdAt_idx" ON "WorkTicket"("type", "status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "WorkTicket_assignedToId_status_idx" ON "WorkTicket"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "WorkTicket_entityType_entityId_idx" ON "WorkTicket"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "WorkTicket_slaDeadlineAt_status_idx" ON "WorkTicket"("slaDeadlineAt", "status");

-- CreateIndex
CREATE INDEX "TicketNote_ticketId_createdAt_idx" ON "TicketNote"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkTicket" ADD CONSTRAINT "WorkTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTicket" ADD CONSTRAINT "WorkTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketNote" ADD CONSTRAINT "TicketNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "WorkTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketNote" ADD CONSTRAINT "TicketNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

