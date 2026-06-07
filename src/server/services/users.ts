import bcrypt from "bcryptjs";
import { Prisma, type SellerProfile } from "@prisma/client";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/tokens";
import { siteConfig } from "@/config/site";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/server/services/mail";

/**
 * User lifecycle business logic: register → verify email → (reset password)
 * → become a seller. SERVER-SIDE ONLY — called from server actions after
 * auth/rate-limit/bot checks. All multi-write flows run in a transaction.
 */

const BCRYPT_ROUNDS = 12;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
// Password-reset tokens share the VerificationToken table, namespaced by
// identifier prefix so they can never be replayed as email-verification tokens.
const RESET_IDENTIFIER_PREFIX = "password-reset:";

/** Error whose message is SAFE to show to the user. Everything else → generic. */
export class UserServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserServiceError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Registration + email verification
// ---------------------------------------------------------------------------

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string; verifyUrl: string }> {
  const email = normalizeEmail(input.email);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  let userId: string;
  try {
    const user = await db.user.create({
      data: { name: input.name, email, passwordHash }, // role defaults to BUYER
      select: { id: true },
    });
    userId = user.id;
  } catch (err) {
    // Unique violation on email — duplicate registration (also covers races).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new UserServiceError(
        "An account with this email already exists. Try logging in instead.",
      );
    }
    throw err;
  }

  const verifyUrl = await issueVerificationLink(email);
  return { userId, verifyUrl };
}

/** Creates a fresh single-use verification token (invalidates older ones). */
async function issueVerificationLink(email: string): Promise<string> {
  const token = generateToken();
  await db.$transaction([
    db.verificationToken.deleteMany({ where: { identifier: email } }),
    db.verificationToken.create({
      data: {
        identifier: email,
        token: hashToken(token), // only the hash is stored
        expires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      },
    }),
  ]);

  const verifyUrl = `${siteConfig.url}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
  await sendVerificationEmail(email, verifyUrl);
  return verifyUrl;
}

export type VerifyEmailResult = "verified" | "already-verified";

export async function verifyEmail(
  rawEmail: string,
  token: string,
): Promise<VerifyEmailResult> {
  const email = normalizeEmail(rawEmail);

  const record = await db.verificationToken.findUnique({
    where: {
      identifier_token: { identifier: email, token: hashToken(token) },
    },
  });

  if (!record) {
    // Token already consumed but the account IS verified → treat as success
    // (e.g. user clicks the email link twice).
    const user = await db.user.findUnique({
      where: { email },
      select: { emailVerified: true },
    });
    if (user?.emailVerified) return "already-verified";
    throw new UserServiceError(
      "This verification link is invalid or was already used. Request a new one below.",
    );
  }

  if (record.expires < new Date()) {
    await db.verificationToken.deleteMany({ where: { identifier: email } });
    throw new UserServiceError(
      "This verification link has expired. Request a new one below.",
    );
  }

  try {
    await db.$transaction([
      db.user.update({
        where: { email },
        data: { emailVerified: new Date() },
      }),
      db.verificationToken.deleteMany({ where: { identifier: email } }),
    ]);
  } catch (err) {
    // P2025 = no user with that email (token without account) → invalid link.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new UserServiceError("This verification link is invalid.");
    }
    throw err;
  }

  return "verified";
}

/**
 * Re-sends the verification link. Anti-enumeration: returns null (and the
 * caller shows the same generic message) when the email is unknown or
 * already verified.
 */
export async function resendVerification(
  rawEmail: string,
): Promise<{ verifyUrl: string | null }> {
  const email = normalizeEmail(rawEmail);
  const user = await db.user.findUnique({
    where: { email },
    select: { emailVerified: true },
  });
  if (!user || user.emailVerified) return { verifyUrl: null };

  const verifyUrl = await issueVerificationLink(email);
  return { verifyUrl };
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * Starts a password reset. Anti-enumeration: silently succeeds for unknown
 * emails and OAuth-only accounts (no passwordHash to reset).
 */
export async function requestPasswordReset(
  rawEmail: string,
): Promise<{ resetUrl: string | null }> {
  const email = normalizeEmail(rawEmail);
  const user = await db.user.findUnique({
    where: { email },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) return { resetUrl: null };

  const identifier = RESET_IDENTIFIER_PREFIX + email;
  const token = generateToken();
  await db.$transaction([
    db.verificationToken.deleteMany({ where: { identifier } }),
    db.verificationToken.create({
      data: {
        identifier,
        token: hashToken(token),
        expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  const resetUrl = `${siteConfig.url}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  await sendPasswordResetEmail(email, resetUrl);
  return { resetUrl };
}

export async function resetPassword(input: {
  email: string;
  token: string;
  password: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  const identifier = RESET_IDENTIFIER_PREFIX + email;

  const record = await db.verificationToken.findUnique({
    where: {
      identifier_token: { identifier, token: hashToken(input.token) },
    },
  });
  if (!record) {
    throw new UserServiceError(
      "This reset link is invalid or was already used. Request a new one.",
    );
  }
  if (record.expires < new Date()) {
    await db.verificationToken.deleteMany({ where: { identifier } });
    throw new UserServiceError(
      "This reset link has expired. Request a new one.",
    );
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  try {
    await db.$transaction([
      db.user.update({ where: { email }, data: { passwordHash } }),
      db.verificationToken.deleteMany({ where: { identifier } }),
    ]);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new UserServiceError("This reset link is invalid.");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Become a seller (BUYER → SELLER, creates SellerProfile + Wallet)
// ---------------------------------------------------------------------------

export async function becomeSeller(
  userId: string,
  input: { displayName: string; country?: string; bio?: string },
): Promise<SellerProfile> {
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          emailVerified: true,
          sellerProfile: true,
        },
      });

      if (!user) throw new UserServiceError("Account not found.");
      if (!user.emailVerified) {
        throw new UserServiceError(
          "Verify your email before becoming a seller.",
        );
      }
      // IDEMPOTENT: double-submit / retry returns the existing profile
      // instead of erroring — repeat calls are always safe (Step 06 spec).
      if (user.sellerProfile) {
        // Self-heal: a profile somehow missing its wallet gets one here.
        await tx.wallet.upsert({
          where: { sellerProfileId: user.sellerProfile.id },
          update: {},
          create: { sellerProfileId: user.sellerProfile.id },
        });
        return user.sellerProfile;
      }

      // SellerProfile + its Wallet are born together, atomically.
      const profile = await tx.sellerProfile.create({
        data: {
          userId,
          displayName: input.displayName,
          country: input.country || null,
          bio: input.bio || null,
          wallet: { create: {} }, // currency defaults to INR; balance = ledger sum
        },
      });

      // ADMIN keeps the ADMIN role (it outranks SELLER); BUYER upgrades.
      if (user.role === "BUYER") {
        await tx.user.update({
          where: { id: userId },
          data: { role: "SELLER" },
        });
      }

      return profile;
    });
  } catch (err) {
    // True race (two tabs both saw "no profile"): the @unique on userId
    // fires P2002 and aborts the loser's tx. Postgres forbids further
    // statements in an aborted tx, so the idempotent recovery read happens
    // HERE, outside it — return the winner's profile.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await db.sellerProfile.findUnique({
        where: { userId },
      });
      if (existing) return existing;
    }
    throw err;
  }
}
