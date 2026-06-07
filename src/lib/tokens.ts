import { createHash, randomBytes } from "crypto";

/**
 * Single-use auth tokens (email verification, password reset).
 * The RAW token goes into the emailed link; only its SHA-256 hash is stored in
 * the DB — so a DB leak never exposes usable verification/reset links.
 */

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
