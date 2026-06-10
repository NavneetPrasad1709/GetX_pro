import { test, expect } from "@playwright/test";

/**
 * Marketplace smoke E2E (Step 34). Public, no auth/seed needed — verifies the
 * shop renders and core navigation works. Runs on both desktop + mobile projects.
 */
test("home page loads with primary navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/GETX/i);
  // The browse/marketplace entry point is reachable from the home page.
  const browse = page.getByRole("link", { name: /browse|marketplace|games/i }).first();
  await expect(browse).toBeVisible();
});

test("games catalog page renders", async ({ page }) => {
  await page.goto("/games");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a category/listing grid is reachable from games", async ({ page }) => {
  await page.goto("/games");
  const firstGame = page.getByRole("link").filter({ hasText: /./ }).first();
  await expect(firstGame).toBeVisible();
});
