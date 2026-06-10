import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encrypt, decrypt, isEncryptionAvailable } from "@/lib/encryption";

/**
 * Auto-delivery encryption is AES-256-GCM and FAIL-CLOSED: no/invalid key →
 * throw, never store plaintext. The key is read from env at call time, so
 * vi.stubEnv controls it per-test.
 */
const VALID_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

describe("encryption (with a valid key)", () => {
  beforeEach(() => vi.stubEnv("DELIVERY_ENCRYPTION_KEY", VALID_KEY));
  afterEach(() => vi.unstubAllEnvs());

  it("reports availability", () => {
    expect(isEncryptionAvailable()).toBe(true);
  });

  it("round-trips plaintext", () => {
    const secret = "account: pro@getx.live / pw: S3cr3t! 🎮";
    const stored = encrypt(secret);
    expect(stored).not.toContain(secret); // ciphertext, not plaintext
    expect(decrypt(stored)).toBe(secret);
  });

  it("produces a fresh IV each call (different ciphertext for same input)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const parsed = JSON.parse(encrypt("legit")) as { iv: string; tag: string; ciphertext: string };
    parsed.ciphertext = parsed.ciphertext.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    expect(() => decrypt(JSON.stringify(parsed))).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decrypt(JSON.stringify({ iv: "00" }))).toThrow(/Malformed/);
  });
});

describe("encryption (no / invalid key) — fail closed", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is unavailable without a key", () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", "");
    expect(isEncryptionAvailable()).toBe(false);
  });

  it("is unavailable with a malformed key", () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", "not-hex");
    expect(isEncryptionAvailable()).toBe(false);
  });

  it("throws on encrypt when the key is missing", () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", "");
    expect(() => encrypt("x")).toThrow(/not configured/);
  });
});
