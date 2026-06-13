"use server";

import { AuthError } from "next-auth";
import { auth, signIn, signOut, updateSession } from "@/lib/auth";
import { getClientIp, rateLimit, rateLimitDistributed } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  becomeSellerSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
} from "@/lib/validators/auth";
import {
  becomeSeller,
  normalizeEmail,
  registerUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  UserServiceError,
} from "@/server/services/users";
import { attributeReferralAtSignup } from "@/server/services/referral";
import { awardSignupBonus } from "@/server/services/loyalty";
import { siteConfig } from "@/config/site";

/**
 * Auth server actions. Every mutation here re-validates input with Zod,
 * rate-limits by IP (and email where it matters) and — for the bot-sensitive
 * register/login/forgot flows — verifies Cloudflare Turnstile server-side.
 *
 * `devLink` is ONLY populated outside production so the UI can show the
 * verify/reset link until real email lands in Step 22.
 */

export type ActionResult = {
  ok: boolean;
  error?: string;
  devLink?: string | null;
};

const isDev = process.env.NODE_ENV !== "production";
const GENERIC_ERROR = "Something went wrong. Please try again.";

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function toSafeError(err: unknown, context: string): ActionResult {
  if (err instanceof UserServiceError) return { ok: false, error: err.message };
  console.error(`[${context}]`, err);
  return { ok: false, error: GENERIC_ERROR };
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export async function registerAction(raw: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const ip = await getClientIp();
  // Distributed (Upstash) limiter on this brute-force surface — global across
  // every serverless instance. Falls back to in-memory when Upstash is unset.
  const rl = await rateLimitDistributed(`register:${ip}`, {
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: `Too many sign-up attempts. Try again in ${rl.retryAfterSec}s.`,
    };
  }

  const bot = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!bot.ok) return { ok: false, error: bot.error };

  try {
    const { userId, verifyUrl } = await registerUser(parsed.data);
    // Prompt 22: attribute the signup to a referrer (never throws; best-effort).
    // Gated: refer-and-earn hidden for now (owner) — see siteConfig.features.referral.
    if (siteConfig.features.referral) await attributeReferralAtSignup(userId, parsed.data.ref);
    // Step 21: 50-point welcome bonus (idempotent; never throws).
    // Gated: rewards/loyalty hidden for now (owner) — see siteConfig.features.loyalty.
    if (siteConfig.features.loyalty) await awardSignupBonus(userId);
    return { ok: true, devLink: isDev ? verifyUrl : null };
  } catch (err) {
    return toSafeError(err, "registerAction");
  }
}

// ---------------------------------------------------------------------------
// Login (Credentials)
// ---------------------------------------------------------------------------

export async function loginAction(raw: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const email = normalizeEmail(parsed.data.email);
  const ip = await getClientIp();

  // Two windows: per IP (botnet-ish bursts) + per IP+account (targeted guessing).
  // Distributed (Upstash) so the cap holds across all serverless instances;
  // env-safe fallback to in-memory when Upstash creds are absent.
  const [perIp, perAccount] = await Promise.all([
    rateLimitDistributed(`login:${ip}`, { limit: 10, windowMs: 60_000 }),
    rateLimitDistributed(`login:${ip}:${email}`, {
      limit: 5,
      windowMs: 5 * 60_000,
    }),
  ]);
  if (!perIp.ok || !perAccount.ok) {
    const retry = Math.max(
      perIp.ok ? 0 : perIp.retryAfterSec,
      perAccount.ok ? 0 : perAccount.retryAfterSec,
    );
    return {
      ok: false,
      error: `Too many login attempts. Try again in ${retry}s.`,
    };
  }

  const bot = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!bot.ok) return { ok: false, error: bot.error };

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirect: false, // the client routes after success
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.type === "CredentialsSignin") {
        return { ok: false, error: "Invalid email or password." };
      }
      console.error("[loginAction] AuthError:", err.type, err);
      return { ok: false, error: "Login failed. Please try again." };
    }
    return toSafeError(err, "loginAction");
  }
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

// ---------------------------------------------------------------------------
// Email verification (resend)
// ---------------------------------------------------------------------------

export async function resendVerificationAction(
  raw: unknown,
): Promise<ActionResult> {
  const parsed = resendVerificationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const ip = await getClientIp();
  const email = normalizeEmail(parsed.data.email);
  const rl = rateLimit(`resend-verify:${ip}:${email}`, {
    limit: 3,
    windowMs: 10 * 60_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: `Too many requests. Try again in ${rl.retryAfterSec}s.`,
    };
  }

  try {
    const { verifyUrl } = await resendVerification(email);
    // Same response whether or not the account exists (anti-enumeration).
    return { ok: true, devLink: isDev ? verifyUrl : null };
  } catch (err) {
    return toSafeError(err, "resendVerificationAction");
  }
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function forgotPasswordAction(raw: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const ip = await getClientIp();
  const rl = await rateLimitDistributed(`forgot-password:${ip}`, {
    limit: 3,
    windowMs: 15 * 60_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: `Too many requests. Try again in ${rl.retryAfterSec}s.`,
    };
  }

  const bot = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!bot.ok) return { ok: false, error: bot.error };

  try {
    const { resetUrl } = await requestPasswordReset(parsed.data.email);
    // Same response whether or not the account exists (anti-enumeration).
    return { ok: true, devLink: isDev ? resetUrl : null };
  } catch (err) {
    return toSafeError(err, "forgotPasswordAction");
  }
}

export async function resetPasswordAction(raw: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const ip = await getClientIp();
  const rl = await rateLimitDistributed(`reset-password:${ip}`, {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${rl.retryAfterSec}s.`,
    };
  }

  try {
    await resetPassword(parsed.data);
    return { ok: true };
  } catch (err) {
    return toSafeError(err, "resetPasswordAction");
  }
}

// ---------------------------------------------------------------------------
// Become a seller (BUYER → SELLER + SellerProfile + Wallet)
// ---------------------------------------------------------------------------

export async function becomeSellerAction(raw: unknown): Promise<ActionResult> {
  // Auth FIRST — never run input handling for anonymous callers.
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be logged in." };
  }

  const parsed = becomeSellerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const rl = rateLimit(`become-seller:${session.user.id}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${rl.retryAfterSec}s.`,
    };
  }

  try {
    await becomeSeller(session.user.id, parsed.data);
    // Refresh the JWT so the new SELLER role is live immediately.
    await updateSession({});
    return { ok: true };
  } catch (err) {
    return toSafeError(err, "becomeSellerAction");
  }
}
