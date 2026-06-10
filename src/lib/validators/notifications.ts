import { z } from "zod";

/**
 * Notification input schemas (Step 22). Shape-checks for the server actions;
 * ownership is enforced inside the service / action against the session user.
 */

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");

export const markNotificationReadSchema = z.object({
  notificationId: id,
});

export const updateEmailPreferenceSchema = z.object({
  enabled: z.boolean(),
});

export const notificationsCursorSchema = z.object({
  cursor: id.optional(),
});

export type UpdateEmailPreferenceInput = z.input<typeof updateEmailPreferenceSchema>;
