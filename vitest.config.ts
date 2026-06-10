import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config (Step 34). Default environment is `node` — our unit tests cover
 * PURE logic (fees, encryption, trust score, order state machine, loyalty math)
 * which has no DOM. A test that needs the DOM opts in per-file with
 * `// @vitest-environment jsdom`.
 *
 * Coverage is GATED only on the fully-unit-tested pure modules (the money +
 * security math). The wider app (RSC pages, server actions, DB services) is
 * exercised by the integration suite + the scripts/qa-*.ts harnesses, not by a
 * blunt global line-coverage number. See docs/DECISIONS.md (Step 34).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Playwright specs live in e2e/ and run via @playwright/test, NOT vitest.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e", "socket-server"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Only the fully pure, unit-tested modules are gated (achievable + honest).
      include: [
        "src/lib/fees.ts",
        "src/lib/encryption.ts",
        "src/config/loyalty.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
