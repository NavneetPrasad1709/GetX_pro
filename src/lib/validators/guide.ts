import { z } from "zod";

/** Community guide input (Step 27). Markdown content is stored raw, rendered safely (no rehype-raw). */

const id = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i, "Invalid id");

export const createGuideSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(160, "Title is too long"),
  gameId: id,
  content: z.string().trim().min(100, "Write at least 100 characters"),
});

export const updateGuideSchema = z.object({
  guideId: id,
  title: z.string().trim().min(3).max(160).optional(),
  content: z.string().trim().min(100).optional(),
});

export type CreateGuideInput = z.infer<typeof createGuideSchema>;
export type UpdateGuideInput = z.infer<typeof updateGuideSchema>;
