-- Step 25 (AI Dispute Judge): pgvector case memory + AI verdict fields.
-- CREATE EXTENSION runs on the DIRECT_URL connection (migrate uses directUrl) and
-- is idempotent. Neon supports pgvector on all plans.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable: AI Dispute Judge fields on the existing Dispute (judgeActorType is a
-- plain string, not a PG enum, to avoid a CREATE TYPE clash).
ALTER TABLE "Dispute" ADD COLUMN     "aiConfidence" INTEGER,
ADD COLUMN     "aiKeyFacts" JSONB,
ADD COLUMN     "aiReasoning" TEXT,
ADD COLUMN     "aiVerdict" TEXT,
ADD COLUMN     "judgeActorType" TEXT NOT NULL DEFAULT 'HUMAN',
ADD COLUMN     "judgedAt" TIMESTAMP(3);

-- CreateTable: resolved-dispute vectors for few-shot retrieval.
CREATE TABLE "DisputeEmbedding" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisputeEmbedding_disputeId_key" ON "DisputeEmbedding"("disputeId");

-- Approximate-nearest-neighbour index for cosine retrieval (pgvector ivfflat).
CREATE INDEX "DisputeEmbedding_embedding_idx"
  ON "DisputeEmbedding" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 50);

-- AddForeignKey
ALTER TABLE "DisputeEmbedding" ADD CONSTRAINT "DisputeEmbedding_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
