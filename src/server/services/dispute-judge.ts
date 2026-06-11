import { randomUUID } from "crypto";
import { z } from "zod";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { isAiEnabled, generateJSON, AI_MODELS } from "@/lib/ai";
import { embedText } from "@/lib/embeddings";
import {
  resolveDispute,
  type DisputeOutcome,
} from "@/server/services/escrow";

/**
 * AI Dispute Judge (Step 25). `claude-opus-4-8` reads the full dispute context
 * (chat, delivery proof, order, reviews) and returns a structured verdict +
 * confidence; resolved cases are stored as pgvector embeddings for few-shot
 * retrieval. High-confidence verdicts AUTO-RESOLVE via the existing escrow
 * `resolveDispute` (the single source of truth for money — we never write a
 * ledger row here); low-confidence verdicts wait for an admin.
 *
 * ENV-SAFE: with no ANTHROPIC_API_KEY the judge is dormant — the background
 * enqueue is a no-op and admins resolve disputes manually exactly as before.
 * Embedding storage/retrieval is best-effort and never blocks a resolution.
 */

export const CONFIDENCE_THRESHOLD = 70;

export type JudgeVerdict = "BUYER" | "SELLER";

export const JudgeOutputSchema = z.object({
  verdict: z.enum(["BUYER", "SELLER"]),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
  keyFacts: z.array(z.string()),
});
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

export type JudgeResult = JudgeOutput & {
  autoResolved: boolean; // true if confidence >= threshold and resolveDispute ran
  requiresHumanReview: boolean; // true if confidence < threshold
};

export type SimilarCase = {
  disputeId: string;
  verdict: string;
  reasoning: string;
  similarity: number;
};

const SAFE_DEFAULT: JudgeOutput = {
  verdict: "BUYER", // refund is the safe default — never auto-pays a seller on a parse failure
  confidence: 0,
  reasoning: "AI parsing failed — manual review required.",
  keyFacts: [],
};

const verdictToOutcome = (v: JudgeVerdict): DisputeOutcome =>
  v === "BUYER" ? "REFUND_BUYER" : "RELEASE_SELLER";

// ---------------------------------------------------------------------------
// Test seam: lets the QA harness inject a deterministic verdict so the full
// pipeline (context load → persist → gate → embed → retrieve) can be exercised
// without a live ANTHROPIC_API_KEY. NULL in production → the real Claude call.
// ---------------------------------------------------------------------------
type JudgeModelFn = (contextString: string, systemPrompt: string) => Promise<JudgeOutput> | JudgeOutput;
let judgeOverride: JudgeModelFn | null = null;
/** TEST-ONLY. Set a canned verdict producer; pass null to restore the real model. */
export function setJudgeModelOverride(fn: JudgeModelFn | null): void {
  // Hard guard: the seam can NEVER be armed in production, even if some code path
  // accidentally calls it — a test verdict must not reach a real money decision.
  if (process.env.NODE_ENV === "production") return;
  judgeOverride = fn;
}

// --- vector case memory ------------------------------------------------------

/** Few-shot retrieval of the most similar resolved cases (cosine via pgvector). */
export async function findSimilarCases(queryText: string, topK = 3): Promise<SimilarCase[]> {
  try {
    const vec = await embedText(queryText);
    const literal = `[${vec.join(",")}]`;
    const rows = await db.$queryRaw<
      Array<{ disputeId: string; verdict: string; reasoning: string; similarity: number }>
    >`
      SELECT de."disputeId" AS "disputeId", de."verdict" AS verdict, de."reasoning" AS reasoning,
             GREATEST(0, 1 - (de."embedding" <=> ${literal}::vector)) AS similarity
      FROM   "DisputeEmbedding" de
      WHERE  de."embedding" IS NOT NULL
      ORDER  BY de."embedding" <=> ${literal}::vector
      LIMIT  ${topK}
    `;
    return rows.map((r) => ({
      disputeId: r.disputeId,
      verdict: r.verdict,
      reasoning: r.reasoning,
      similarity: Number(r.similarity),
    }));
  } catch (err) {
    captureException(err);
    return []; // retrieval must never break a resolution
  }
}

/** Upsert a resolved case into the vector store. Best-effort; never throws. */
export async function storeDisputeEmbedding(
  disputeId: string,
  verdict: string,
  reasoning: string,
): Promise<void> {
  try {
    const vec = await embedText(`${verdict} ${reasoning}`);
    const literal = `[${vec.join(",")}]`;
    const id = randomUUID();
    await db.$executeRaw`
      INSERT INTO "DisputeEmbedding" ("id", "disputeId", "verdict", "reasoning", "embedding", "createdAt")
      VALUES (${id}, ${disputeId}, ${verdict}, ${reasoning}, ${literal}::vector, NOW())
      ON CONFLICT ("disputeId") DO UPDATE SET
        "verdict"   = EXCLUDED."verdict",
        "reasoning" = EXCLUDED."reasoning",
        "embedding" = EXCLUDED."embedding"
    `;
  } catch (err) {
    captureException(err);
  }
}

// --- context loading ---------------------------------------------------------

async function loadDisputeContext(disputeId: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      order: {
        include: {
          listing: {
            select: { title: true, description: true, priceMinor: true, deliveryType: true },
          },
          buyer: { select: { id: true, email: true } },
          seller: {
            select: {
              id: true,
              displayName: true,
              trustScore: true,
              ratingAvg: true,
              ratingCount: true,
              totalSales: true,
              kycStatus: true,
            },
          },
          delivery: { select: { content: true, createdAt: true } },
          conversation: {
            select: {
              messages: {
                orderBy: { createdAt: "asc" },
                take: 30,
                select: { body: true, senderId: true, createdAt: true },
              },
            },
          },
        },
      },
      openedBy: { select: { id: true } },
    },
  });
  return dispute;
}

type LoadedDispute = NonNullable<Awaited<ReturnType<typeof loadDisputeContext>>>;

function buildContextString(d: LoadedDispute, buyerId: string): string {
  const o = d.order;
  const subtotal = o.unitPriceMinor * o.qty;
  const lines: string[] = [
    `DISPUTE: reason="${d.reason}" status=${d.status} openedBy=${d.openedById === buyerId ? "BUYER" : "SELLER"} at=${d.createdAt.toISOString()}`,
    `ORDER: status=${o.status} qty=${o.qty} unitPriceMinor=${o.unitPriceMinor} subtotalMinor=${subtotal} buyerFeeMinor=${o.feeMinor} sellerCommissionMinor=${o.sellerFeeMinor} totalMinor=${o.totalMinor} createdAt=${o.createdAt.toISOString()} deliveredAt=${o.deliveredAt ? o.deliveredAt.toISOString() : "n/a"}`,
    `LISTING: title="${o.listing.title}" deliveryType=${o.listing.deliveryType} priceMinor=${o.listing.priceMinor}`,
    `DESCRIPTION: ${(o.listing.description ?? "").slice(0, 600)}`,
    `BUYER: id=${o.buyer.id}`,
    `SELLER: name="${o.seller.displayName}" trustScore=${o.seller.trustScore} rating=${o.seller.ratingAvg}/5 (${o.seller.ratingCount} reviews) totalSales=${o.seller.totalSales} kyc=${o.seller.kycStatus}`,
    `DELIVERY PROOF: ${o.delivery ? `provided at ${o.delivery.createdAt.toISOString()} — ${o.delivery.content.slice(0, 600)}` : "NONE — seller did not mark delivery"}`,
  ];

  const msgs = o.conversation?.messages ?? [];
  if (msgs.length > 0) {
    lines.push("CHAT (oldest→newest, last 30):");
    for (const m of msgs) {
      const who = m.senderId === buyerId ? "BUYER" : "SELLER";
      lines.push(`  [${who}] ${m.body.slice(0, 300)}`);
    }
  } else {
    lines.push("CHAT: no messages");
  }
  return lines.join("\n");
}

async function loadRecentReviews(buyerId: string, sellerId: string): Promise<string> {
  const reviews = await db.review.findMany({
    where: { buyerId, sellerId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { rating: true, comment: true, createdAt: true },
  });
  if (reviews.length === 0) return "REVIEWS (this buyer↔seller): none";
  return [
    "REVIEWS (this buyer↔seller, newest first):",
    ...reviews.map((r) => `  ${r.rating}/5 — ${(r.comment ?? "").slice(0, 200)}`),
  ].join("\n");
}

function buildSystemPrompt(similarCasesBlock: string): string {
  return `You are the GETX AI Dispute Judge — an impartial arbitrator for a gaming marketplace escrow system.

GETX DISPUTE POLICY:
- Escrow funds are held until the buyer confirms receipt or the auto-release timer expires.
- The seller must deliver within the agreed window. Proof of delivery (screenshots, delivery note) is required. The buyer has 48 hours to dispute after delivery is marked.
- Verdict SELLER = release escrow to the seller (seller wins). Verdict BUYER = refund the buyer (buyer wins).
- Base your verdict on: delivery proof quality, communication tone, order timeline, seller reputation, and GETX policy. If the evidence is genuinely ambiguous, lower your confidence below 70.

FEES (do NOT penalise the dispute winner for fees — fees are sunk cost):
- The buyer pays a platform fee at checkout (non-refundable only on a SELLER verdict).
- Seller commission is deducted at payout (already accounted for in escrow).

SIMILAR PAST CASES:
${similarCasesBlock}

Reply with ONLY valid JSON — no prose, no markdown, no code fences:
{"verdict":"BUYER"|"SELLER","confidence":<integer 0-100>,"reasoning":"<2-4 sentences>","keyFacts":["<fact1>","<fact2>"]}`;
}

// --- the judge pipeline ------------------------------------------------------

/** Full pipeline: load context → retrieve similar cases → judge → persist + gate. */
export async function judgeDispute(disputeId: string): Promise<JudgeResult> {
  try {
    const d = await loadDisputeContext(disputeId);
    if (!d) throw new DisputeJudgeError("Dispute not found.");

    // Idempotency: only OPEN disputes are judged. (Re-firing on a resolved one is a no-op.)
    if (d.status !== "OPEN") {
      console.warn(`[dispute-judge] ${disputeId} already ${d.status} — skipping`);
      return {
        verdict: (d.aiVerdict as JudgeVerdict) ?? "BUYER",
        confidence: d.aiConfidence ?? 0,
        reasoning: d.aiReasoning ?? "Already resolved.",
        keyFacts: Array.isArray(d.aiKeyFacts) ? (d.aiKeyFacts as string[]) : [],
        // Truthfully reflect who resolved it (judgeActorType is set atomically on resolve).
        autoResolved: d.judgeActorType === "AI",
        requiresHumanReview: false,
      };
    }

    const buyerId = d.order.buyer.id;
    const contextString = buildContextString(d, buyerId);
    const reviewsBlock = await loadRecentReviews(buyerId, d.order.seller.id);
    const fullContext = `${contextString}\n${reviewsBlock}`;

    const similar = await findSimilarCases(fullContext.slice(0, 500), 3);
    const similarCasesBlock =
      similar.length === 0
        ? "No past cases available yet."
        : similar
            .map(
              (c, i) =>
                `PAST CASE ${i + 1} (similarity ${c.similarity.toFixed(2)}, verdict ${c.verdict}): ${c.reasoning}`,
            )
            .join("\n");

    const systemPrompt = buildSystemPrompt(similarCasesBlock);

    // Get the verdict: test override > real model (key required) > safe default on parse fail.
    let output: JudgeOutput;
    if (judgeOverride) {
      output = await judgeOverride(fullContext, systemPrompt);
    } else {
      if (!isAiEnabled()) {
        throw new DisputeJudgeError(
          "AI Dispute Judge unavailable: ANTHROPIC_API_KEY is not configured.",
        );
      }
      const out = await generateJSON({
        schema: JudgeOutputSchema,
        system: systemPrompt,
        prompt: fullContext,
        model: AI_MODELS.reasoning, // claude-opus-4-8 — hard reasoning, money at stake
        maxTokens: 1024,
        retries: 1,
      });
      output = out ?? SAFE_DEFAULT;
    }

    // Persist the AI fields with a CAS on status=OPEN, so an admin resolving
    // between our load and here can't be clobbered (and we won't then resolve).
    const claim = await db.dispute.updateMany({
      where: { id: disputeId, status: "OPEN" },
      data: {
        aiVerdict: output.verdict,
        aiConfidence: output.confidence,
        aiReasoning: output.reasoning,
        aiKeyFacts: output.keyFacts,
        judgedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      // Already resolved by someone else — report the true state, don't re-resolve.
      const fresh = await db.dispute.findUnique({
        where: { id: disputeId },
        select: { judgeActorType: true },
      });
      return {
        ...output,
        autoResolved: fresh?.judgeActorType === "AI",
        requiresHumanReview: false,
      };
    }

    if (output.confidence >= CONFIDENCE_THRESHOLD) {
      try {
        // resolveDispute owns its own transaction + the append-only ledger, and
        // stamps judgeActorType="AI" ATOMICALLY with the status CAS + money move.
        // A null actor records this as a system (AI) action (AuditLog.actorId nullable).
        await resolveDispute(
          null,
          d.orderId,
          verdictToOutcome(output.verdict),
          `AI Dispute Judge (confidence ${output.confidence}%): ${output.reasoning}`.slice(0, 500),
          "AI",
        );
        // Best-effort: remember this case for future few-shot retrieval.
        await storeDisputeEmbedding(disputeId, output.verdict, output.reasoning);
        return { ...output, autoResolved: true, requiresHumanReview: false };
      } catch (err) {
        // The order may no longer be resolvable (e.g. admin already acted) —
        // judgeActorType is untouched; the admin queue shows the un-resolved dispute.
        captureException(err);
        console.error(`[dispute-judge] auto-resolve failed for ${disputeId}`, err);
        return { ...output, autoResolved: false, requiresHumanReview: true };
      }
    }

    return { ...output, autoResolved: false, requiresHumanReview: true };
  } catch (err) {
    captureException(err);
    throw err; // surface to the caller (the enqueue wrapper logs it)
  }
}

// --- admin actions (gating happens in the Server Action wrappers) ------------

export class DisputeJudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisputeJudgeError";
  }
}

export type AdminVerdictResult =
  | { ok: true; message: string; orderId: string }
  | { ok: false; error: string };

/** Admin accepts the AI's suggested verdict on an OPEN dispute (1-click). */
export async function acceptAiVerdict(
  adminUserId: string,
  disputeId: string,
): Promise<AdminVerdictResult> {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, orderId: true, status: true, aiVerdict: true },
  });
  if (!dispute) return { ok: false, error: "Dispute not found." };
  if (dispute.status !== "OPEN") {
    return { ok: true, message: "Already resolved.", orderId: dispute.orderId };
  }
  if (dispute.aiVerdict !== "BUYER" && dispute.aiVerdict !== "SELLER") {
    return { ok: false, error: "No AI verdict to accept yet." };
  }

  try {
    await resolveDispute(
      adminUserId,
      dispute.orderId,
      verdictToOutcome(dispute.aiVerdict),
      `Admin accepted AI verdict (${dispute.aiVerdict}).`,
    );
    await db.auditLog.create({
      data: {
        actorId: adminUserId,
        action: "ACCEPT_AI_VERDICT",
        entity: "Dispute",
        entityId: disputeId,
        meta: { verdict: dispute.aiVerdict, model: AI_MODELS.reasoning },
      },
    });
    return { ok: true, message: `Resolved (${dispute.aiVerdict}).`, orderId: dispute.orderId };
  } catch (err) {
    captureException(err);
    return { ok: false, error: "Could not resolve the dispute." };
  }
}

/**
 * Admin overrides the AI on an OPEN dispute, resolving with their chosen verdict.
 * The corrected case is stored as a (high-quality) embedding for future few-shot
 * retrieval. NOTE: an already-AUTO-RESOLVED dispute is NOT auto-reversed here —
 * the money has settled via the ledger; reversing it needs a manual compensating
 * entry (out of scope). We still record the correction + learning signal.
 */
export async function overrideAiVerdict(
  adminUserId: string,
  disputeId: string,
  overrideVerdict: JudgeVerdict,
  overrideReason: string,
): Promise<AdminVerdictResult> {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, orderId: true, status: true, aiReasoning: true },
  });
  if (!dispute) return { ok: false, error: "Dispute not found." };

  // Already settled → record the correction for learning, but don't reverse money.
  if (dispute.status !== "OPEN") {
    await storeDisputeEmbedding(
      disputeId,
      overrideVerdict,
      `[ADMIN CORRECTION] ${overrideReason}`,
    );
    await db.auditLog.create({
      data: {
        actorId: adminUserId,
        action: "OVERRIDE_AI_VERDICT",
        entity: "Dispute",
        entityId: disputeId,
        meta: { verdict: overrideVerdict, note: overrideReason, alreadySettled: true },
      },
    });
    return {
      ok: true,
      message: "Recorded the correction. The dispute was already settled — reverse the money manually if needed.",
      orderId: dispute.orderId,
    };
  }

  try {
    await resolveDispute(
      adminUserId,
      dispute.orderId,
      verdictToOutcome(overrideVerdict),
      `[ADMIN OVERRIDE: ${overrideReason}]`,
    );
    await db.dispute.update({
      where: { id: disputeId },
      data: {
        aiReasoning: `${dispute.aiReasoning ?? ""} [ADMIN OVERRIDE: ${overrideReason}]`.trim(),
      },
    });
    // Human-corrected cases are the highest-quality training data.
    await storeDisputeEmbedding(disputeId, overrideVerdict, overrideReason);
    await db.auditLog.create({
      data: {
        actorId: adminUserId,
        action: "OVERRIDE_AI_VERDICT",
        entity: "Dispute",
        entityId: disputeId,
        meta: { verdict: overrideVerdict, note: overrideReason },
      },
    });
    return { ok: true, message: `Overridden → resolved (${overrideVerdict}).`, orderId: dispute.orderId };
  } catch (err) {
    captureException(err);
    return { ok: false, error: "Could not override the dispute." };
  }
}

// --- background enqueue (fire-and-forget on dispute creation) -----------------

/**
 * Schedule the judge to run AFTER the dispute-creation response is sent. Dormant
 * without an API key (no-op). TODO: replace setTimeout(0) with a durable queue
 * (Vercel Cron / BullMQ) so a cold-start can't drop the job.
 */
export function enqueueDisputeJudgeByOrder(orderId: string): void {
  if (!isAiEnabled()) return; // judge is dormant without a key — admins resolve manually
  setTimeout(() => {
    void (async () => {
      const d = await db.dispute.findUnique({ where: { orderId }, select: { id: true } });
      if (d) await judgeDispute(d.id);
    })().catch((err) => {
      console.error("[dispute-judge] background job failed", err);
      captureException(err);
    });
  }, 0);
}
