import { randomBytes } from "node:crypto";
import { Prisma, type ReferralStatus } from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";
import { referralConfig } from "@/config/referral";
import { formatMoney } from "@/lib/money";
import { createNotification } from "@/server/services/notifications";

/**
 * Referral engine (Prompt 22) — SERVER-SIDE ONLY, fraud-gated double-sided viral loop.
 *
 * Reward currency is the FEE_CREDIT fallback (User.referralCreditMinor, paise) until Step 21
 * loyalty points ship. The referee gets a small signup credit immediately; the referrer's
 * (larger) reward is DEFERRED to the referee's FIRST COMPLETED order — the only genuine
 * conversion event (payment cleared + delivery accepted + escrow released). `Referral.bonusAwarded`
 * is a CAS guard so the referrer is rewarded EXACTLY ONCE even under concurrent completions.
 *
 * Fraud properties: `Referral.refereeId @unique` (a user is referred by at most one person);
 * self-referral blocked; reward never triggers on signup alone (farming a signup bonus isn't worth
 * the friction); refunds never reach this path (they go through refundInTx, not order completion).
 * Every function is best-effort and NEVER throws — a referral failure must never break signup or
 * block a seller from being paid.
 */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

function randomCode(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return out;
}

/** Get the user's share code, generating + persisting one on first use (collision-safe). */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode(referralConfig.codeLength);
    try {
      // Idempotent: only sets when still null, so a concurrent setter can't be clobbered.
      const res = await db.user.updateMany({
        where: { id: userId, referralCode: null },
        data: { referralCode: code },
      });
      if (res.count === 1) return code;
      // Someone set it first → return theirs.
      const u = await db.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (u?.referralCode) return u.referralCode;
    } catch (err) {
      // Code collision on the unique index → try a fresh code.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not generate a unique referral code.");
}

/**
 * Attribute a signup to a referrer (called from registerAction). Creates the PENDING Referral
 * and grants the referee their signup credit. Silently no-ops on an unknown code, self-referral,
 * or an already-referred user. Never throws.
 */
export async function attributeReferralAtSignup(
  refereeUserId: string,
  rawCode: string | null | undefined,
): Promise<void> {
  const code = rawCode?.trim().toUpperCase();
  if (!code) return;
  try {
    const referrer = await db.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!referrer || referrer.id === refereeUserId) return; // unknown code or self-referral

    const cfg = referralConfig.buyer; // referee is a buyer at signup
    const created = await db.$transaction(async (tx) => {
      const existing = await tx.referral.findUnique({
        where: { refereeId: refereeUserId },
        select: { id: true },
      });
      if (existing) return false; // already referred (refereeId unique)
      await tx.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId: refereeUserId,
          kind: "BUYER",
          status: "PENDING",
          rewardType: "FEE_CREDIT",
          referrerRewardAmount: cfg.referrerRewardMinor,
          refereeRewardAmount: cfg.refereeSignupMinor,
        },
      });
      await tx.user.update({
        where: { id: refereeUserId },
        data: {
          referredBy: code,
          referralCreditMinor: { increment: cfg.refereeSignupMinor },
        },
      });
      return true;
    });
    if (!created) return;

    void createNotification({
      userId: refereeUserId,
      type: "REFERRAL",
      title: "Welcome bonus unlocked",
      body: `You earned ${formatMoney(cfg.refereeSignupMinor)} credit. Complete your first order to keep it.`,
      link: "/referrals",
    });
    void createNotification({
      userId: referrer.id,
      type: "REFERRAL",
      title: "Someone joined with your code",
      body: `You'll earn ${formatMoney(cfg.referrerRewardMinor)} when they complete their first order.`,
      link: "/referrals",
    });
  } catch (err) {
    captureException(err);
  }
}

/**
 * Award the referrer's deferred bonus when a referee completes an order. Idempotent via a CAS flip
 * on `bonusAwarded` — exactly one caller ever credits the referrer, no matter how many completed
 * orders or concurrent calls. Best-effort, post-commit; NEVER throws, NEVER blocks the order path.
 */
export async function checkAndAwardReferralBonus(refereeUserId: string): Promise<void> {
  try {
    const awarded = await db.$transaction(async (tx) => {
      const moved = await tx.referral.updateMany({
        where: { refereeId: refereeUserId, bonusAwarded: false, status: "PENDING" },
        data: { bonusAwarded: true, status: "COMPLETED" },
      });
      if (moved.count === 0) return null; // no referral, or already awarded
      const ref = await tx.referral.findUnique({
        where: { refereeId: refereeUserId },
        select: { referrerId: true, referrerRewardAmount: true },
      });
      if (!ref) return null;
      await tx.user.update({
        where: { id: ref.referrerId },
        data: { referralCreditMinor: { increment: ref.referrerRewardAmount } },
      });
      return ref;
    });

    if (awarded) {
      void createNotification({
        userId: awarded.referrerId,
        type: "REFERRAL",
        title: "Referral reward earned!",
        body: `You earned ${formatMoney(awarded.referrerRewardAmount)} — a friend you referred just completed their first order.`,
        link: "/referrals",
      });
    }
  } catch (err) {
    captureException(err);
  }
}

// --- read side (dashboard) --------------------------------------------------

export type ReferralHistoryRow = {
  id: string;
  refereeLabel: string; // privacy-truncated
  status: ReferralStatus;
  rewardMinor: number;
  createdAt: string;
};

export type ReferralStats = {
  code: string;
  shareUrl: string;
  creditMinor: number;
  completed: number;
  pending: number;
  earnedMinor: number;
  history: ReferralHistoryRow[];
};

/**
 * Privacy-safe referral history label. Codes can be PUBLIC (a streamer posts one),
 * so strangers may sign up under it — never expose a referee's full name or email.
 * Show only the first 3 characters of the name (or email local-part) + an ellipsis.
 */
function refereeLabel(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0];
  return `${source.slice(0, 3)}…`;
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const code = await ensureReferralCode(userId);
  const [user, given] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { referralCreditMinor: true },
    }),
    db.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        referrerRewardAmount: true,
        createdAt: true,
        referee: { select: { name: true, email: true } },
      },
    }),
  ]);

  const completed = given.filter((g) => g.status === "COMPLETED").length;
  const pending = given.filter((g) => g.status === "PENDING").length;
  const earnedMinor = given
    .filter((g) => g.status === "COMPLETED")
    .reduce((s, g) => s + g.referrerRewardAmount, 0);

  return {
    code,
    shareUrl: `${siteConfig.url.replace(/\/$/, "")}/?ref=${code}`,
    creditMinor: user?.referralCreditMinor ?? 0,
    completed,
    pending,
    earnedMinor,
    history: given.map((g) => ({
      id: g.id,
      refereeLabel: refereeLabel(g.referee.name, g.referee.email),
      status: g.status,
      rewardMinor: g.referrerRewardAmount,
      createdAt: g.createdAt.toISOString(),
    })),
  };
}
