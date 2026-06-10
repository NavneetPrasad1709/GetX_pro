"use server";

import { revalidatePath } from "next/cache";
import { captureException } from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { createGuideSchema, updateGuideSchema } from "@/lib/validators/guide";
import {
  createGuide,
  updateGuide,
  publishGuide,
  unpublishGuide,
  deleteGuide,
  toggleLike,
  incrementViewCount,
  GuideServiceError,
} from "@/server/services/guides";

/**
 * Community guide actions (Step 27). Role + ownership are re-checked here; admin publish/unpublish
 * are audit-logged. Markdown is never rendered with raw HTML (XSS-safe at the render layer).
 */

export type GuideActionResult =
  | { ok: true; guideId?: string; liked?: boolean }
  | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await auth();
  return session?.user?.id && session.user.role === "ADMIN" ? { id: session.user.id } : null;
}

export async function createGuideAction(raw: unknown): Promise<GuideActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please sign in." };
  if (session.user.role !== "SELLER" && session.user.role !== "ADMIN") {
    return { ok: false, error: "Only sellers can write guides." };
  }
  if (!rateLimit(`guide-create:${session.user.id}`, { limit: 10, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests — wait a moment." };
  }
  const parsed = createGuideSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    const guide = await createGuide(parsed.data, session.user.id);
    revalidatePath("/seller/guides");
    revalidatePath("/guides");
    return { ok: true, guideId: guide.id };
  } catch (err) {
    if (err instanceof GuideServiceError) return { ok: false, error: err.message };
    captureException(err);
    return { ok: false, error: GENERIC };
  }
}

export async function updateGuideAction(raw: unknown): Promise<GuideActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please sign in." };
  const parsed = updateGuideSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    const guide = await updateGuide(parsed.data.guideId, session.user.id, {
      title: parsed.data.title,
      content: parsed.data.content,
    });
    revalidatePath("/seller/guides");
    return { ok: true, guideId: guide.id };
  } catch (err) {
    if (err instanceof GuideServiceError) return { ok: false, error: err.message };
    captureException(err);
    return { ok: false, error: GENERIC };
  }
}

export async function deleteGuideAction(guideId: string): Promise<GuideActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please sign in." };
  try {
    await deleteGuide(guideId, session.user.id);
    revalidatePath("/seller/guides");
    return { ok: true };
  } catch (err) {
    if (err instanceof GuideServiceError) return { ok: false, error: err.message };
    captureException(err);
    return { ok: false, error: GENERIC };
  }
}

export async function toggleGuideLikeAction(guideId: string): Promise<GuideActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in to like guides." };
  if (!rateLimit(`guide-like:${session.user.id}`, { limit: 60, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests." };
  }
  try {
    const { liked } = await toggleLike(guideId, session.user.id);
    return { ok: true, liked };
  } catch (err) {
    captureException(err);
    return { ok: false, error: GENERIC };
  }
}

export async function recordGuideViewAction(guideId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return; // anonymous views aren't counted (MVP)
  try {
    await incrementViewCount(guideId, session.user.id);
  } catch (err) {
    captureException(err);
  }
}

export async function publishGuideAction(guideId: string): Promise<GuideActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  try {
    await publishGuide(guideId);
    await db.auditLog.create({
      data: { actorId: admin.id, action: "PUBLISH_GUIDE", entity: "Guide", entityId: guideId },
    });
    revalidatePath("/admin/guides");
    revalidatePath("/guides");
    return { ok: true };
  } catch (err) {
    captureException(err);
    return { ok: false, error: GENERIC };
  }
}

export async function unpublishGuideAction(guideId: string): Promise<GuideActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  try {
    await unpublishGuide(guideId);
    await db.auditLog.create({
      data: { actorId: admin.id, action: "UNPUBLISH_GUIDE", entity: "Guide", entityId: guideId },
    });
    revalidatePath("/admin/guides");
    revalidatePath("/guides");
    return { ok: true };
  } catch (err) {
    captureException(err);
    return { ok: false, error: GENERIC };
  }
}
