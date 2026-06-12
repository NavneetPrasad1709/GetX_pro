import { randomBytes } from "crypto";
import { Prisma, type Guide } from "@prisma/client";
import { db } from "@/lib/db";
import { checkAndAwardGuideAuthorBadge } from "@/server/services/badges";
import type { CreateGuideInput } from "@/lib/validators/guide";

/**
 * Community guides (Step 27). Markdown content is stored RAW and rendered with react-markdown +
 * remark-gfm + rehype-highlight only (no rehype-raw, no dangerouslySetInnerHTML) — XSS-safe.
 * Role + ownership are enforced in the Server Actions that call these; published-guide deletes are
 * blocked. TRUSTED_VETERAN sellers (500+ sales) auto-publish; everyone else lands in review.
 */

export class GuideServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideServiceError";
  }
}

const VETERAN_SALES = 500;

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${base || "guide"}-${randomBytes(3).toString("hex")}`;
}

export type GuideWithMeta = Guide & {
  author: {
    id: string;
    name: string | null;
    image: string | null;
    sellerProfile: { id: string } | null;
  };
  game: { name: string; slug: string };
};

const guideInclude = {
  author: {
    select: {
      id: true,
      name: true,
      image: true,
      // SellerProfile.id powers the author→profile link (P1-T4); null when the
      // author never opened a seller profile, in which case the link is hidden.
      sellerProfile: { select: { id: true } },
    },
  },
  game: { select: { name: true, slug: true } },
} satisfies Prisma.GuideInclude;

export async function getPublishedGuides(filters: {
  gameId?: string;
  gameSlug?: string;
  take?: number;
  skip?: number;
}): Promise<GuideWithMeta[]> {
  return db.guide.findMany({
    where: {
      published: true,
      ...(filters.gameId ? { gameId: filters.gameId } : {}),
      ...(filters.gameSlug ? { game: { slug: filters.gameSlug } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filters.take ?? 12,
    skip: filters.skip ?? 0,
    include: guideInclude,
  });
}

export async function getGuideBySlug(slug: string): Promise<GuideWithMeta | null> {
  return db.guide.findUnique({ where: { slug }, include: guideInclude });
}

export async function getSellerGuides(authorId: string): Promise<Guide[]> {
  return db.guide.findMany({ where: { authorId }, orderBy: { createdAt: "desc" } });
}

/**
 * Count a unique view (logged-in users only). Idempotent per (user, guide); the author's own views
 * never inflate the count. One transaction: insert the view marker + bump viewCount on first sight.
 */
export async function incrementViewCount(guideId: string, userId: string): Promise<void> {
  const guide = await db.guide.findUnique({ where: { id: guideId }, select: { authorId: true } });
  if (!guide) return;
  // createMany + skipDuplicates: no P2002 thrown; `count` is 1 only on a genuinely new view.
  const res = await db.guideView.createMany({ data: [{ guideId, userId }], skipDuplicates: true });
  if (res.count > 0 && guide.authorId !== userId) {
    await db.guide.update({ where: { id: guideId }, data: { viewCount: { increment: 1 } } });
  }
}

/** Toggle a like for (user, guide). Returns the resulting liked state. likeCount floored at 0. */
export async function toggleLike(guideId: string, userId: string): Promise<{ liked: boolean }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.guideLike.findUnique({
      where: { userId_guideId: { userId, guideId } },
      select: { id: true },
    });
    if (existing) {
      await tx.guideLike.delete({ where: { id: existing.id } });
      await tx.guide.updateMany({
        where: { id: guideId, likeCount: { gt: 0 } },
        data: { likeCount: { decrement: 1 } },
      });
      return { liked: false };
    }
    await tx.guideLike.create({ data: { guideId, userId } });
    await tx.guide.update({ where: { id: guideId }, data: { likeCount: { increment: 1 } } });
    return { liked: true };
  });
}

/** Create a guide. Auto-publishes for TRUSTED_VETERAN sellers (≥500 sales), else draft for review. */
export async function createGuide(input: CreateGuideInput, authorId: string): Promise<Guide> {
  const profile = await db.sellerProfile.findUnique({
    where: { userId: authorId },
    select: { totalSales: true },
  });
  const autoPublish = (profile?.totalSales ?? 0) >= VETERAN_SALES;

  try {
    return await db.$transaction(async (tx) => {
      const guide = await tx.guide.create({
        data: {
          authorId,
          gameId: input.gameId,
          title: input.title,
          slug: slugify(input.title),
          content: input.content,
          published: autoPublish,
        },
      });
      if (autoPublish) await checkAndAwardGuideAuthorBadge(authorId, tx);
      return guide;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new GuideServiceError("That title is already taken — try a different one.");
    }
    throw err;
  }
}

/**
 * Update a guide (ownership-checked by the caller). The slug is LOCKED after first publish (SEO),
 * and editing a published guide sends it back to review (published = false).
 */
export async function updateGuide(
  guideId: string,
  authorId: string,
  input: { title?: string; content?: string },
): Promise<Guide> {
  const guide = await db.guide.findUnique({ where: { id: guideId }, select: { authorId: true, published: true } });
  if (!guide || guide.authorId !== authorId) throw new GuideServiceError("Guide not found.");
  return db.guide.update({
    where: { id: guideId },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.content ? { content: input.content } : {}),
      // Editing a live guide re-queues it for admin review.
      ...(guide.published ? { published: false } : {}),
    },
  });
}

export async function publishGuide(guideId: string): Promise<Guide> {
  return db.$transaction(async (tx) => {
    const guide = await tx.guide.update({ where: { id: guideId }, data: { published: true } });
    await checkAndAwardGuideAuthorBadge(guide.authorId, tx);
    return guide;
  });
}

export async function unpublishGuide(guideId: string): Promise<Guide> {
  return db.guide.update({ where: { id: guideId }, data: { published: false } });
}

/** Seller deletes a DRAFT (published guides can only be unpublished by an admin — SEO preservation). */
export async function deleteGuide(guideId: string, authorId: string): Promise<void> {
  const guide = await db.guide.findUnique({ where: { id: guideId }, select: { authorId: true, published: true } });
  if (!guide || guide.authorId !== authorId) throw new GuideServiceError("Guide not found.");
  if (guide.published) throw new GuideServiceError("Published guides can't be deleted — unpublish first.");
  await db.guide.delete({ where: { id: guideId } });
}

// --- Leaderboards -----------------------------------------------------------

export type LeaderboardRow = {
  sellerId: string;
  userId: string;
  displayName: string;
  image: string | null;
  ratingAvg: number;
  ratingCount: number;
  completedSales: number;
};

/** Top sellers for a game by completed orders in the last 30 days. */
export async function getGameLeaderboard(gameId: string, limit = 10): Promise<LeaderboardRow[]> {
  const rows = await db.$queryRaw<
    {
      sellerId: string;
      userId: string;
      displayName: string;
      image: string | null;
      ratingAvg: number;
      ratingCount: number;
      cnt: bigint;
    }[]
  >`
    SELECT sp.id          AS "sellerId",
           sp."userId"    AS "userId",
           sp."displayName" AS "displayName",
           u."image"      AS image,
           sp."ratingAvg" AS "ratingAvg",
           sp."ratingCount" AS "ratingCount",
           COUNT(*)       AS cnt
    FROM "Order" o
    JOIN "Listing" l        ON l.id = o."listingId"
    JOIN "SellerProfile" sp ON sp.id = o."sellerId"
    JOIN "User" u           ON u.id = sp."userId"
    WHERE o."status" = 'COMPLETED'
      AND l."gameId" = ${gameId}
      AND o."updatedAt" >= NOW() - INTERVAL '30 days'
    GROUP BY sp.id, sp."userId", sp."displayName", u."image", sp."ratingAvg", sp."ratingCount"
    ORDER BY cnt DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    sellerId: r.sellerId,
    userId: r.userId,
    displayName: r.displayName,
    image: r.image,
    ratingAvg: r.ratingAvg,
    ratingCount: r.ratingCount,
    completedSales: Number(r.cnt),
  }));
}
