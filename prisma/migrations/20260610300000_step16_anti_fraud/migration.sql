-- Anti-fraud architecture (Prompt 16)

-- Enums
DO $$ BEGIN CREATE TYPE "FraudTargetType" AS ENUM ('USER','LISTING','ORDER','REVIEW','MESSAGE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FraudSeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FraudFlagStatus" AS ENUM ('OPEN','REVIEWING','DISMISSED','ACTIONED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FraudAutoAction" AS ENUM ('HOLD_PAYOUT','FREEZE_LISTING','FORCE_RE_KYC','BAN_USER','NONE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- User fraud fields
ALTER TABLE "User"
  ADD COLUMN "lastLoginIp" TEXT,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "payoutHeld"  BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "User_lastLoginIp_idx" ON "User"("lastLoginIp");

-- SellerProfile payout hold
ALTER TABLE "SellerProfile" ADD COLUMN "payoutHeldAt" TIMESTAMP(3);

-- Order buyer IP
ALTER TABLE "Order" ADD COLUMN "buyerIp" TEXT;

-- FraudFlag
CREATE TABLE "FraudFlag" (
  "id"           TEXT NOT NULL,
  "targetType"   "FraudTargetType" NOT NULL,
  "targetId"     TEXT NOT NULL,
  "reason"       TEXT NOT NULL,
  "severity"     "FraudSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status"       "FraudFlagStatus" NOT NULL DEFAULT 'OPEN',
  "autoDetected" BOOLEAN NOT NULL DEFAULT true,
  "autoAction"   "FraudAutoAction" NOT NULL DEFAULT 'NONE',
  "riskScore"    INTEGER NOT NULL DEFAULT 0,
  "metadata"     JSONB NOT NULL DEFAULT '{}',
  "reviewedBy"   TEXT,
  "reviewNote"   TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FraudFlag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FraudFlag_targetId_reason_key" ON "FraudFlag"("targetId","reason");
CREATE INDEX "FraudFlag_status_severity_createdAt_idx" ON "FraudFlag"("status","severity","createdAt");
CREATE INDEX "FraudFlag_targetId_idx" ON "FraudFlag"("targetId");
CREATE INDEX "FraudFlag_targetType_status_idx" ON "FraudFlag"("targetType","status");

-- DeviceFingerprint
CREATE TABLE "DeviceFingerprint" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "ipAddress"   TEXT NOT NULL,
  "userAgent"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceFingerprint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeviceFingerprint_userId_fingerprint_key" ON "DeviceFingerprint"("userId","fingerprint");
CREATE INDEX "DeviceFingerprint_userId_idx" ON "DeviceFingerprint"("userId");
CREATE INDEX "DeviceFingerprint_fingerprint_idx" ON "DeviceFingerprint"("fingerprint");
CREATE INDEX "DeviceFingerprint_ipAddress_idx" ON "DeviceFingerprint"("ipAddress");

ALTER TABLE "DeviceFingerprint"
  ADD CONSTRAINT "DeviceFingerprint_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
