"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  saveSearch,
  deleteSavedSearch,
  SavedSearchError,
} from "@/server/services/saved-search";

/**
 * Saved-search actions (P3-T3). Auth + rate-limit re-checked here; the service
 * sanitizes/whitelists the filter JSON. The owner's UI calls these from the
 * marketplace filter bar + a manage list.
 */

const ID_RE = /^[a-z0-9]+$/i;

export type SavedSearchResult = { ok: true } | { ok: false; error: string; needsAuth?: boolean };

export async function saveSearchAction(
  filters: unknown,
  label?: unknown,
): Promise<SavedSearchResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in to save searches.", needsAuth: true };
  }
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return { ok: false, error: "Invalid search." };
  }
  if (!rateLimit(`saved-search:${session.user.id}`, { limit: 15, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests — slow down a moment." };
  }
  try {
    await saveSearch(
      session.user.id,
      filters as Record<string, unknown>,
      typeof label === "string" ? label : undefined,
    );
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    if (err instanceof SavedSearchError) return { ok: false, error: err.message };
    Sentry.captureException(err);
    console.error("[saveSearchAction]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function deleteSavedSearchAction(id: unknown): Promise<SavedSearchResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please log in." };
  if (typeof id !== "string" || id.length > 64 || !ID_RE.test(id)) {
    return { ok: false, error: "Invalid request." };
  }
  try {
    await deleteSavedSearch(session.user.id, id);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    console.error("[deleteSavedSearchAction]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
