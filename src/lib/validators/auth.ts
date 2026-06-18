import { z } from "zod";
import { isValidCountry } from "@/config/countries";

/**
 * Auth input schemas — ONE schema per input, used by BOTH the client form
 * (react-hook-form resolver) and the server action (re-validated, always).
 * Emails are normalized (lowercase) in the server layer before hitting the DB.
 */

export const emailField = z
  .email("Enter a valid email address")
  .max(254, "Email is too long");

// bcrypt truncates at 72 UTF-8 BYTES (not characters). A plain .max(72) caps
// UTF-16 code units, so a multibyte passphrase (accents/CJK/emoji) could pass
// while exceeding 72 bytes and be silently truncated — weakening it without the
// user knowing. Reject (don't truncate) anything over 72 bytes. TextEncoder is
// isomorphic (client + server in Next 16) so the same gate runs in both layers.
const within72Bytes = (v: string) => new TextEncoder().encode(v).length <= 72;

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .refine(within72Bytes, "Password must be at most 72 bytes")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name is too long"),
  email: emailField,
  password: passwordField,
  turnstileToken: z.string().optional(),
  // Referral code captured from ?ref= at signup (Prompt 22). Optional, attribution-only.
  ref: z.string().trim().max(16).optional(),
});

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(1, "Enter your password")
    .max(72, "Password is too long")
    .refine(within72Bytes, "Password is too long"),
  turnstileToken: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
  turnstileToken: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  email: emailField,
  token: z.string().min(1, "Missing reset token"),
  password: passwordField,
});

export const resendVerificationSchema = z.object({
  email: emailField,
  turnstileToken: z.string().optional(),
});

// Email verification is consumed via a POST action (not a GET render) so link
// pre-fetchers / email scanners can't burn the single-use token.
export const verifyEmailSchema = z.object({
  email: emailField,
  token: z.string().min(1, "Missing verification token"),
});

export const becomeSellerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(3, "Display name must be at least 3 characters")
    .max(30, "Display name must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_ .-]+$/,
      "Only letters, numbers, spaces, dots, dashes and underscores",
    ),
  // Required + chosen from the ISO list (O-T6) — no free text, validated on the
  // server too (becomeSellerAction re-runs this schema).
  country: z
    .string()
    .trim()
    .min(1, "Select your country")
    .refine(isValidCountry, "Select a valid country from the list"),
  bio: z.string().trim().max(500, "Bio must be at most 500 characters").optional(),
  // z.literal(true): the checkbox MUST be ticked; false/undefined both fail.
  agreeTerms: z.literal(true, "You must accept the seller terms to continue"),
});

// Used inside NextAuth's Credentials authorize() — never trust raw credentials.
export const credentialsSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(72).refine(within72Bytes),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type BecomeSellerInput = z.infer<typeof becomeSellerSchema>;
