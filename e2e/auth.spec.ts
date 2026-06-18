import { test, expect } from "@playwright/test";

/**
 * Auth + route-protection E2E (Step 34). The redirect tests exercise the REAL
 * Edge proxy (src/proxy.ts) — an unauthenticated user hitting a protected route
 * must be bounced to /login with a callbackUrl. No DB seed needed.
 */
test("login page renders the credentials form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});

test("register page renders", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByLabel(/email/i)).toBeVisible();
});

test("protected route redirects guests to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
});

test("admin route redirects guests to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
});

test("forgot-password page renders the email form", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByLabel(/email/i)).toBeVisible();
});

test("logout route clears the session and lands on /login?signedout=1", async ({ page }) => {
  // The cookie-clearing sign-out endpoint must redirect to /login (NOT loop) even
  // with no active session — this is the revocation redirect-loop fix.
  await page.goto("/logout");
  await expect(page).toHaveURL(/\/login\?signedout=1/);
});

test("verify-email shows a Confirm button (token is NOT consumed on GET)", async ({ page }) => {
  // The single-use token is consumed by a POST action, so the GET render must
  // present a confirm button rather than silently verifying (email-scanner safe).
  await page.goto("/verify-email?token=dummy-token&email=test@example.com");
  await expect(page.getByRole("button", { name: /verify my email/i })).toBeVisible();
});
