import { describe, it, expect, vi, afterEach } from "vitest";
import { safeCallbackUrl } from "@/lib/utils";
import { authLog, hashEmail } from "@/lib/auth-log";
import { generateToken, hashToken } from "@/lib/tokens";
import {
  passwordField,
  loginSchema,
  registerSchema,
  verifyEmailSchema,
} from "@/lib/validators/auth";

/**
 * Auth security unit tests — pure logic only (no DB / no server). These pin the
 * exact behaviours the production audit hardened: the open-redirect guard, the
 * bcrypt 72-byte password cap, PII-safe auth logging, and single-use token
 * hashing. The full flows are exercised by e2e/auth.spec.ts + the qa harnesses.
 */

// ---------------------------------------------------------------------------
// safeCallbackUrl — open-redirect guard (CWE-601)
// ---------------------------------------------------------------------------
describe("safeCallbackUrl", () => {
  it("keeps a genuine same-origin path (with query + hash)", () => {
    expect(safeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(safeCallbackUrl("/seller/wallet")).toBe("/seller/wallet");
    expect(safeCallbackUrl("/orders?id=5#tab")).toBe("/orders?id=5#tab");
  });

  it("rejects protocol-relative '//' redirects", () => {
    expect(safeCallbackUrl("//evil.com")).toBe("/dashboard");
  });

  it("rejects BACKSLASH redirects '/\\evil.com' (the audited bypass)", () => {
    // Browsers normalize "\" to "/", so "/\evil.com" == "//evil.com" → off-origin.
    expect(safeCallbackUrl("/\\evil.com")).toBe("/dashboard");
    expect(safeCallbackUrl("/\\/evil.com")).toBe("/dashboard");
  });

  it("rejects absolute URLs and control-char tricks", () => {
    expect(safeCallbackUrl("https://evil.com")).toBe("/dashboard");
    expect(safeCallbackUrl("/\t/evil.com")).toBe("/dashboard");
    expect(safeCallbackUrl("javascript:alert(1)")).toBe("/dashboard");
  });

  it("falls back to /dashboard for empty / relative / nullish input", () => {
    expect(safeCallbackUrl(undefined)).toBe("/dashboard");
    expect(safeCallbackUrl(null)).toBe("/dashboard");
    expect(safeCallbackUrl("")).toBe("/dashboard");
    expect(safeCallbackUrl("relative/path")).toBe("/dashboard");
  });
});

// ---------------------------------------------------------------------------
// Password policy — bcrypt truncates at 72 BYTES, not characters
// ---------------------------------------------------------------------------
describe("passwordField", () => {
  it("accepts a valid password (≥8 chars, letter + number)", () => {
    expect(passwordField.safeParse("abcd1234").success).toBe(true);
  });

  it("rejects too-short / missing letter / missing number", () => {
    expect(passwordField.safeParse("ab1").success).toBe(false); // too short
    expect(passwordField.safeParse("abcdefgh").success).toBe(false); // no digit
    expect(passwordField.safeParse("12345678").success).toBe(false); // no letter
  });

  it("accepts exactly 72 ASCII bytes", () => {
    const pw = "a".repeat(71) + "1"; // 72 chars = 72 bytes
    expect(passwordField.safeParse(pw).success).toBe(true);
  });

  it("rejects a multibyte password over 72 BYTES that is under 72 chars", () => {
    const pw = "é".repeat(40) + "a1"; // 42 chars but 82 bytes
    expect(pw.length).toBeLessThanOrEqual(72);
    expect(new TextEncoder().encode(pw).length).toBeGreaterThan(72);
    expect(passwordField.safeParse(pw).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schemas accept/reject the right shapes
// ---------------------------------------------------------------------------
describe("auth schemas", () => {
  it("loginSchema requires a valid email and non-empty password", () => {
    expect(loginSchema.safeParse({ email: "x@y.com", password: "p" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "nope", password: "p" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "x@y.com", password: "" }).success).toBe(false);
  });

  it("registerSchema enforces name + email + strong password", () => {
    expect(
      registerSchema.safeParse({ name: "Ash", email: "a@b.com", password: "abcd1234" }).success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ name: "A", email: "a@b.com", password: "abcd1234" }).success,
    ).toBe(false); // name too short
  });

  it("verifyEmailSchema requires email + token", () => {
    expect(verifyEmailSchema.safeParse({ email: "a@b.com", token: "t" }).success).toBe(true);
    expect(verifyEmailSchema.safeParse({ email: "a@b.com", token: "" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hashEmail — stable, normalized, non-reversible fingerprint
// ---------------------------------------------------------------------------
describe("hashEmail", () => {
  it("normalizes case + whitespace to the same fingerprint", () => {
    expect(hashEmail("Test@Example.com")).toBe(hashEmail("  test@example.com "));
  });

  it("never returns the raw email and is a short hex token", () => {
    const h = hashEmail("user@example.com");
    expect(h).toMatch(/^[a-f0-9]{12}$/);
    expect(h).not.toContain("user@example.com");
  });

  it("returns undefined for nullish input", () => {
    expect(hashEmail(undefined)).toBeUndefined();
    expect(hashEmail(null)).toBeUndefined();
    expect(hashEmail("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// authLog — PII-safe structured events
// ---------------------------------------------------------------------------
describe("authLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits a [AUTH] event with emailHash but NEVER the raw email", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    authLog("login.success", { userId: "u_1", email: "secret@example.com" });
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0] as string;
    expect(line).toContain("[AUTH] login.success");
    expect(line).toContain("u_1");
    expect(line).toContain(hashEmail("secret@example.com")!);
    expect(line).not.toContain("secret@example.com");
  });

  it("routes .fail / .denied events to stderr (console.warn)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    authLog("login.fail", { reason: "bad-credentials" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tokens — single-use, hash-at-rest
// ---------------------------------------------------------------------------
describe("verification/reset tokens", () => {
  it("generateToken returns a 64-hex (32-byte) random token", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });

  it("hashToken is deterministic, non-identity, and SHA-256 shaped", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
  });
});
