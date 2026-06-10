import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for auto-delivery item content (Step 19).
 *
 * FAIL-CLOSED: `DELIVERY_ENCRYPTION_KEY` must be exactly 64 hex chars (32 bytes,
 * `openssl rand -hex 32`). If it's absent or malformed, encrypt/decrypt throw
 * immediately — we NEVER silently store plaintext or skip encryption. Feature
 * code gates on `isEncryptionAvailable()` (hide the upload UI, fall back to
 * MANUAL delivery) so the app degrades gracefully instead of crashing.
 *
 * The key value is never logged. Stored format: JSON {iv, tag, ciphertext} (hex).
 */

const ALGO = "aes-256-gcm";
const KEY_RE = /^[0-9a-f]{64}$/i;

function getKey(): Buffer {
  const hex = process.env.DELIVERY_ENCRYPTION_KEY;
  if (!hex || !KEY_RE.test(hex)) {
    throw new Error("DELIVERY_ENCRYPTION_KEY not configured");
  }
  return Buffer.from(hex, "hex");
}

/** True when a valid 32-byte hex key is configured (for feature-gating). */
export function isEncryptionAvailable(): boolean {
  const hex = process.env.DELIVERY_ENCRYPTION_KEY;
  return !!hex && KEY_RE.test(hex);
}

/** Encrypt → `{"iv","tag","ciphertext"}` hex JSON string. Throws if no key. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  });
}

/** Decrypt the `{iv,tag,ciphertext}` JSON produced by `encrypt`. Throws if no key / tampered. */
export function decrypt(stored: string): string {
  const parsed = JSON.parse(stored) as { iv?: string; tag?: string; ciphertext?: string };
  if (!parsed.iv || !parsed.tag || !parsed.ciphertext) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(parsed.iv, "hex"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
