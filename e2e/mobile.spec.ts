import { test, expect } from "@playwright/test";

/**
 * Mobile-first E2E (Step 34). CLAUDE.md mandates mobile-first; this runs on the
 * mobile-chrome (Pixel 7) project and checks the phone layout + drawer nav.
 * Skipped on desktop projects where there is no hamburger menu.
 */
test.describe("mobile layout", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile viewport only");

  test("home renders and the mobile menu opens", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/GETX/i);
    // The hamburger / menu trigger is present on small screens.
    const menu = page.getByRole("button", { name: /menu|open menu|navigation/i }).first();
    await expect(menu).toBeVisible();
    await menu.click();
    // After opening, navigation links are reachable.
    await expect(page.getByRole("link", { name: /games|marketplace|browse/i }).first()).toBeVisible();
  });
});
