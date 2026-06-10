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
