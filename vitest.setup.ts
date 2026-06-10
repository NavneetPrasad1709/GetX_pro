// Vitest global setup (Step 34). Runs before each test file.
//
// 1. Register @testing-library/jest-dom matchers (toBeInTheDocument, etc.) for
//    any jsdom-environment component test. Importing it in a node-env test is a
//    harmless no-op (it only calls expect.extend).
import "@testing-library/jest-dom/vitest";

// 2. Integration tests run against a DISPOSABLE test database (a Neon branch),
//    never the dev/prod DB. When TEST_DATABASE_URL is provided, point Prisma at
//    it here — BEFORE any test file imports src/lib/db.ts — so the PrismaClient
//    singleton is constructed against the test DB. Without it, the integration
//    suite skips itself (see src/__tests__/integration/*).
if (process.env.TEST_DATABASE_URL) {
  // SAFETY GUARD: the integration suite WRITES + DELETES real rows. Refuse to
  // run unless the URL clearly looks disposable (a test DB / Neon branch /
  // localhost). A typo pointing this at dev/prod would otherwise corrupt data.
  const url = process.env.TEST_DATABASE_URL;
  const looksDisposable = /test|branch|localhost|127\.0\.0\.1/i.test(url);
  if (!looksDisposable && process.env.ALLOW_UNSAFE_TEST_DB !== "1") {
    throw new Error(
      "Refusing to run integration tests: TEST_DATABASE_URL does not look like a " +
        "disposable test database (expected 'test'/'branch'/localhost in the URL). " +
        "Point it at a Neon branch, or set ALLOW_UNSAFE_TEST_DB=1 to override.",
    );
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
