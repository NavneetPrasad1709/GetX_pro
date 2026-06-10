import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config (Step 34). Specs live in e2e/ and run against a real
 * server. They are DORMANT until a CI job (or a developer) runs:
 *   npx playwright install --with-deps   # one-time, fetch browsers
 *   npm run test:e2e
 *
 * The webServer block boots the app automatically. Locally it reuses an
 * already-running dev server; in CI it builds + starts a production server.
 * Set E2E_BASE_URL to point at a deployed preview instead of booting locally.
 */
const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Mobile-first marketplace → always test a phone viewport too (CLAUDE.md).
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
  // Don't boot a local server when targeting a deployed preview URL.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: isCI ? "npm run build && npm run start" : "npm run dev",
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: !isCI,
      },
});
