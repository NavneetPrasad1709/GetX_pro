import { z } from "zod";

/** Sumsub payload schemas (Step 29) — shared by the service + webhook. */

export const SumsubWebhookSchema = z.object({
  type: z.string(),
  applicantId: z.string(),
  createdAt: z.string(),
  reviewResult: z
    .object({
      reviewAnswer: z.enum(["GREEN", "RED"]).optional(),
      rejectLabels: z.array(z.string()).optional(),
    })
    .optional(),
});
export type SumsubWebhookPayload = z.infer<typeof SumsubWebhookSchema>;

export const SumsubApplicantResponseSchema = z.object({ id: z.string() });
export const SumsubTokenResponseSchema = z.object({ token: z.string() });

/** Tolerant status parse — reviewAnswer can live in a couple of shapes; degrade to null otherwise. */
export const SumsubStatusResponseSchema = z.object({
  reviewStatus: z.string().optional(),
  reviewResult: z
    .object({ reviewAnswer: z.enum(["GREEN", "RED"]).optional(), rejectLabels: z.array(z.string()).optional() })
    .optional(),
  review: z
    .object({
      reviewResult: z
        .object({ reviewAnswer: z.enum(["GREEN", "RED"]).optional(), rejectLabels: z.array(z.string()).optional() })
        .optional(),
    })
    .optional(),
});
