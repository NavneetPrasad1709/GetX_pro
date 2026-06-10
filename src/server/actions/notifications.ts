"use server";

import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { siteConfig } from "@/config/site";
import {
  markNotificationReadSchema,
  updateEmailPreferenceSchema,
} from "@/lib/validators/notifications";
import {
  getNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updateEmailPreference,
  type NotificationRow,
} from "@/server/services/notifications";

/**
 * Notification server actions (Step 22). Standard shape: auth → (rate limit) →
 * Zod → service. Ownership is enforced inside the service (every read/write is
 * scoped by the session user's id) — a user can never touch another's row.
 */

const GENERIC = "Something went wrong. Please try again.";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export type NotificationsResult =
  | { ok: true; notifications: NotificationRow[]; unread: number }
  | { ok: false };

/** Lazy-load the bell dropdown: latest notifications + the unread count. */
export async function getNotificationsAction(): Promise<NotificationsResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  try {
    const [notifications, unread] = await Promise.all([
      getNotifications(userId, siteConfig.notifications.feedPageSize),
      countUnreadNotifications(userId),
    ]);
    return { ok: true, notifications, unread };
  } catch {
    return { ok: false };
  }
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

export async function markNotificationReadAction(
  raw: unknown,
): Promise<SimpleResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please log in." };

  const parsed = markNotificationReadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await markNotificationRead(userId, parsed.data.notificationId);
    return { ok: true };
  } catch (err) {
    console.error("[markNotificationReadAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export type MarkAllResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function markAllNotificationsReadAction(): Promise<MarkAllResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please log in." };

  // Stop badge-clear spam (the only "bulk write" action here).
  const rl = rateLimit(`notifications:markAllRead:${userId}`, {
    limit: siteConfig.notifications.markAllReadLimit,
    windowMs: siteConfig.notifications.markAllReadWindowMs,
  });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  try {
    const count = await markAllNotificationsRead(userId);
    return { ok: true, count };
  } catch (err) {
    console.error("[markAllNotificationsReadAction]", err);
    return { ok: false, error: GENERIC };
  }
}

export async function updateEmailPreferenceAction(
  raw: unknown,
): Promise<SimpleResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please log in." };

  const parsed = updateEmailPreferenceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await updateEmailPreference(userId, parsed.data.enabled);
    return { ok: true };
  } catch (err) {
    console.error("[updateEmailPreferenceAction]", err);
    return { ok: false, error: GENERIC };
  }
}
