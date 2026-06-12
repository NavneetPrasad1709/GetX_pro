import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Saved searches (P3-T3). SERVER-SIDE ONLY. A buyer saves a marketplace filter
 * set; a daily job (owner wires the cron slot — Hobby has a 2-cron cap, so fold
 * into an existing daily cron or move to Pro) calls `runSavedSearchAlerts` to
 * notify when matching ACTIVE supply appears. The UI (save button, manage list)
 * is wired by the owner against these functions.
 */

export class SavedSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavedSearchError";
  }
}

const MAX_PER_USER = 20;

/** Allowed filter keys we persist (a whitelist — never store arbitrary JSON). */
type StoredFilters = {
  q?: string;
  game?: string;
  type?: string;
  delivery?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  trust?: number;
  rating?: number;
  verified?: boolean;
};

function sanitizeFilters(input: Record<string, unknown>): StoredFilters {
  const f: StoredFilters = {};
  const str = (v: unknown) => (typeof v === "string" && v.length <= 80 ? v : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  if (str(input.q)) f.q = input.q as string;
  if (str(input.game)) f.game = input.game as string;
  if (str(input.type)) f.type = input.type as string;
  if (str(input.delivery)) f.delivery = input.delivery as string;
  if (num(input.minPriceMinor) !== undefined) f.minPriceMinor = input.minPriceMinor as number;
  if (num(input.maxPriceMinor) !== undefined) f.maxPriceMinor = input.maxPriceMinor as number;
  if (num(input.trust) !== undefined) f.trust = input.trust as number;
  if (num(input.rating) !== undefined) f.rating = input.rating as number;
  if (input.verified === true) f.verified = true;
  return f;
}

export async function saveSearch(
  userId: string,
  rawFilters: Record<string, unknown>,
  label?: string,
): Promise<void> {
  const filters = sanitizeFilters(rawFilters);
  if (Object.keys(filters).length === 0) {
    throw new SavedSearchError("Add at least one filter before saving a search.");
  }
  const count = await db.savedSearch.count({ where: { userId } });
  if (count >= MAX_PER_USER) {
    throw new SavedSearchError(
      "You've reached the maximum number of saved searches — delete one first.",
    );
  }
  await db.savedSearch.create({
    data: {
      userId,
      filtersJson: filters as Prisma.InputJsonValue,
      label: label?.trim().slice(0, 80) || null,
    },
  });
}

/** Delete a saved search the user owns (ownership enforced in WHERE). */
export async function deleteSavedSearch(userId: string, id: string): Promise<void> {
  await db.savedSearch.deleteMany({ where: { id, userId } });
}

export type SavedSearchRow = {
  id: string;
  label: string | null;
  filters: StoredFilters;
  createdAt: string;
};

export async function getMySavedSearches(userId: string): Promise<SavedSearchRow[]> {
  const rows = await db.savedSearch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    filters: (r.filtersJson as StoredFilters) ?? {},
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Build the Prisma WHERE for matching NEW ACTIVE listings against saved filters. */
function matchWhere(f: StoredFilters, since: Date): Prisma.ListingWhereInput {
  return {
    status: "ACTIVE",
    stock: { gt: 0 },
    createdAt: { gt: since },
    ...(f.game ? { game: { slug: f.game, isActive: true } } : {}),
    ...(f.type ? { type: f.type as Prisma.ListingWhereInput["type"] } : {}),
    ...(f.delivery
      ? { deliveryType: f.delivery as Prisma.ListingWhereInput["deliveryType"] }
      : {}),
    ...(f.minPriceMinor !== undefined ? { priceMinor: { gte: f.minPriceMinor } } : {}),
    ...(f.maxPriceMinor !== undefined
      ? { priceMinor: { ...(f.minPriceMinor !== undefined ? { gte: f.minPriceMinor } : {}), lte: f.maxPriceMinor } }
      : {}),
    ...(f.q ? { title: { contains: f.q, mode: "insensitive" } } : {}),
    ...(f.trust !== undefined || f.rating !== undefined || f.verified
      ? {
          seller: {
            ...(f.trust !== undefined ? { trustScore: { gte: f.trust } } : {}),
            ...(f.rating !== undefined ? { ratingAvg: { gte: f.rating } } : {}),
            ...(f.verified ? { kycStatus: "APPROVED" as const } : {}),
          },
        }
      : {}),
  };
}

/**
 * Count, per saved search, how many NEW matching listings appeared since the
 * last alert. Returns the searches that have at least one new match (the caller
 * — a daily cron — fires the notification + updates lastNotifiedAt). Pure read;
 * never throws on a single bad row.
 */
export async function findSavedSearchMatches(
  now = new Date(),
): Promise<{ id: string; userId: string; label: string | null; newCount: number }[]> {
  const searches = await db.savedSearch.findMany({
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const out: { id: string; userId: string; label: string | null; newCount: number }[] = [];
  for (const s of searches) {
    const since = s.lastNotifiedAt ?? s.createdAt;
    // Don't re-alert more than once per day per search.
    if (now.getTime() - since.getTime() < 23 * 60 * 60 * 1000 && s.lastNotifiedAt) continue;
    try {
      const newCount = await db.listing.count({
        where: matchWhere((s.filtersJson as StoredFilters) ?? {}, since),
      });
      if (newCount > 0) out.push({ id: s.id, userId: s.userId, label: s.label, newCount });
    } catch {
      /* skip a malformed saved filter — never break the sweep */
    }
  }
  return out;
}

/** Mark a saved search alerted (called by the cron after sending the notification). */
export async function markSavedSearchNotified(id: string, now = new Date()): Promise<void> {
  await db.savedSearch.updateMany({ where: { id }, data: { lastNotifiedAt: now } });
}
