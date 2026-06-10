# STEP 34 — Test Suite (Vitest + Playwright)

> Goal: Ship a production-grade test suite — unit (Vitest), integration (critical money paths on a
> separate Neon test branch), and E2E (Playwright against localhost). CI runs all three on every push.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §2, §3, §4, §7). Work in `D:\GetX`. This is **Step 34 — Test Suite (Vitest + Playwright)**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Install dependencies and configure Vitest**
   - Install all testing dependencies in the root package.json (not inside `socket-server/`):
     ```
     npm install -D vitest @vitest/ui @vitest/coverage-v8 \
       @testing-library/react @testing-library/user-event @testing-library/jest-dom \
       jsdom @types/jsdom \
       @playwright/test
     ```
   - Create `vitest.config.ts` at the project root:
     - Set `environment: "jsdom"` as default (overridden to `node` for integration tests via
       project config blocks).
     - Configure the `@/` alias to resolve to `src/` (must match `tsconfig.json` paths).
     - Define two Vitest **projects** inside the config:
       - `unit` — matches `src/__tests__/unit/**/*.test.ts?(x)`, environment `jsdom`.
       - `integration` — matches `src/__tests__/integration/**/*.test.ts`, environment `node`,
         `setupFiles: ["src/__tests__/integration/setup.ts"]`.
     - Set `coverage.provider: "v8"`, `coverage.include: ["src/server/services/**", "src/lib/**"]`,
       `coverage.thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }`.
     - Set `test.globals: true` (so `describe`, `it`, `expect`, `vi` are available without imports
       in test files).
   - Add the following scripts to `package.json`:
     ```json
     "test":          "vitest run",
     "test:ui":       "vitest --ui",
     "test:coverage": "vitest run --coverage",
     "test:e2e":      "playwright test",
     "test:e2e:ui":   "playwright test --ui"
     ```
   - Create `playwright.config.ts` at the project root:
     - `testDir: "e2e"`.
     - `webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 }`.
     - Devices: `"Desktop Chrome"`, `"Desktop Firefox"`, and a custom `"Mobile Safari 375"` with
       `viewport: { width: 375, height: 812 }` using `devices["iPhone 12"]` as base.
     - `reporter: [["html", { outputFolder: "playwright-report" }], ["list"]]`.
     - `use: { baseURL: "http://localhost:3000", screenshot: "only-on-failure", video: "retain-on-failure" }`.
     - `timeout: 30_000`; `retries: process.env.CI ? 2 : 0`.
   - Add `playwright-report/` and `coverage/` to `.gitignore`.
   - **Edge cases**: `vitest.config.ts` must not interfere with `next build` (Vitest is dev-only,
     never imported in app code). Confirm `tsconfig.json` `exclude` does not accidentally include
     test files in the production build.

2. **Integration test setup** (`src/__tests__/integration/setup.ts`)
   - This file is the `setupFiles` entry for all integration tests. It must:
     - Read `TEST_DATABASE_URL` from `process.env` (not from `.env` — from `.env.test`). If the
       variable is absent, `throw new Error("TEST_DATABASE_URL is not set — integration tests require a separate Neon branch")`.
     - Override `process.env.DATABASE_URL` with `TEST_DATABASE_URL` before any Prisma client is
       created, so the Prisma singleton (`src/lib/db.ts`) connects to the test database, not the
       production database.
     - Run `prisma migrate deploy` via `execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL! } })` at test-suite start (once per run, idempotent). The interactive `migrate dev` must never be used here — only `migrate deploy` (matches the repo convention for non-interactive migration).
   - Create `.env.test` (gitignored — add it to `.gitignore`) with a single key:
     ```
     TEST_DATABASE_URL=   # Point this to a separate Neon branch (never the prod/dev branch)
     ```
   - Add `TEST_DATABASE_URL=` (key only, no value) to `.env.example`.
   - Every integration test file must clean up its own test data in an `afterEach` or `afterAll`
     using `prisma.deleteMany({ where: { ... } })` or the same `idKey` pattern used in
     `scripts/qa-step*.ts` harnesses. The test DB is shared across CI runs; never assume it is
     empty at the start.

3. **Unit tests — `src/__tests__/unit/`**
   Create the following test files. Each file must import the module under test from `@/lib/...`
   or `@/server/services/...`. Use `vi.mock` only when the module calls external I/O (Prisma,
   Claude API, R2); for pure functions (fees, encryption, trust score signals) test the real
   implementation with no mocks.

   - **`lib/fees.test.ts`** — tests for `src/lib/fees.ts`:
     - `computeBuyerFee(priceMinor)`: 5 % of price in minor units, rounded half-up. Test
       boundary: `priceMinor = 1` → fee `1`; `priceMinor = 100` → fee `5`;
       `priceMinor = 101` → fee `6` (ceil); `priceMinor = 0` → fee `0`.
     - `computeSellerCommissionMinor(priceMinor, categoryKind)`: test each category kind defined
       in `src/lib/fees.ts` (or `docs/FEES.md`) with at least one representative amount.
     - Reconciliation: `buyerTotal = priceMinor + buyerFee`; `sellerNet = priceMinor - sellerCommission`.
       Assert `platformRevenue = buyerFee + sellerCommission` and both values are non-negative
       integers.
     - Rounding: amounts that produce `.5` fractional paisa must round up (half-up), not banker's
       round. Test with specific amounts that expose half-up vs half-even divergence.

   - **`lib/encryption.test.ts`** — tests for `src/lib/encryption.ts` (if it exists; if the
     module is elsewhere, locate it by reading the codebase before writing the test):
     - Round-trip: `decrypt(encrypt(plaintext)) === plaintext` for a 32-char random key.
     - Different keys: `decrypt(encrypt(plaintext, keyA), keyB)` must throw or return
       `null`/`undefined` — never silently return garbage.
     - Empty string: `encrypt("")` must not throw; `decrypt(encrypt(""))` === `""`.
     - Key absent: if the env key is missing, `encrypt`/`decrypt` must throw a clear error, not
       a crypto exception with an opaque stack trace.

   - **`services/trust-score.test.ts`** — tests for `src/server/services/trust-score.ts` (or
     wherever the trust score computation lives; read the file first):
     - All 6 signals contribute to the score (identity, reviews, order history, response time,
       dispute rate, KYC). Test with a mock `SellerProfile` object where each signal is at its
       maximum, minimum, and mid-range.
     - Boundary: score must always be clamped to `[0, 100]`. Test with inputs that would
       mathematically overflow above 100 or below 0.
     - Weights: if weights are configurable, test that changing a weight changes the score
       proportionally. If hardcoded, document the formula in a comment and test it.
     - No I/O in the computation function itself — if the service fetches from the DB, mock
       Prisma with `vi.mock("@/lib/db")` and provide a stub `SellerProfile` object.

   - **`services/orders.test.ts`** — tests for the order state machine in
     `src/server/services/orders.ts`:
     - Allowed transitions: for each status in `["PENDING", "AWAITING_PAYMENT", "PAID",
       "IN_PROGRESS", "DELIVERED", "COMPLETED", "DISPUTED", "CANCELLED", "EXPIRED"]` (adjust to
       match the actual `OrderStatus` enum in `prisma/schema.prisma`), assert that
       `isAllowedTransition(from, to)` returns `true` for valid next states.
     - Rejected transitions: assert `isAllowedTransition("COMPLETED", "PENDING")` returns
       `false`; `isAllowedTransition("CANCELLED", "PAID")` returns `false`. Cover at least 5
       invalid transitions.
     - If `isAllowedTransition` is not exported as a standalone function, test the service
       function that enforces transitions (mock Prisma) and assert it throws on invalid input.

   - **`services/fraud-radar.test.ts`** — tests for `src/server/services/fraud-radar.ts`:
     - One test per fraud rule defined in the service. Read the service file before writing tests
       to get the exact rule names and thresholds.
     - Each test: provide a mock input that clearly triggers the rule and assert the flag or score
       exceeds the threshold; then provide an input that clearly does not trigger it and assert
       the opposite.
     - Mock all DB calls with `vi.mock("@/lib/db")`. No real DB access in unit tests.

   - **`services/loyalty.test.ts`** — tests for `src/server/services/loyalty.ts`:
     - Earn: placing an order of `X` minor units earns the correct points. Test with the actual
       earn rate from the service.
     - Redeem: redeeming `N` points deducts from balance; redemption above balance throws.
     - Balance: `getBalance(userId)` sums credits minus debits correctly. Use a mock ledger array.
     - Idempotency: calling earn with the same `orderId` twice must not double-credit (if the
       service implements it; check the source first).
     - Mock Prisma throughout.

4. **Integration tests — `src/__tests__/integration/`**
   All integration tests run against `TEST_DATABASE_URL`. They call the real service functions
   (no mocks). Each test file creates its own test data with a unique, namespaced identifier
   (e.g., `TEST_${Date.now()}_${Math.random().toString(36).slice(2)}`) and deletes it in
   `afterAll`. These tests are the formal, committed counterparts of the `scripts/qa-stepXX.ts`
   harnesses (which remain as quick manual run scripts).

   - **`payments/apply-event.test.ts`** — tests for `applyPaymentEvent` in
     `src/server/services/orders.ts` or `src/server/services/escrow.ts` (locate the function
     that handles the webhook-driven payment state transition):
     - PAID + hold: a `PAYMENT_CONFIRMED` event on an `AWAITING_PAYMENT` order transitions it to
       `PAID`, creates a `LedgerEntry` with `kind: HOLD`, increments `heldMinor` on the buyer
       wallet. Assert all three side-effects in the test DB.
     - Duplicate no-op: sending the same event a second time (same provider event id) must not
       create a second `LedgerEntry` or change the order status. Assert `ProcessedWebhook` count
       is 1 after two calls.
     - Concurrent one-wins: fire two concurrent `applyPaymentEvent` calls for the same order
       using `Promise.all`. Exactly one must succeed (transition order to PAID); the other must
       throw or no-op. Assert the DB has exactly one `LedgerEntry` for that order after both
       settle. This tests the `SELECT … FOR UPDATE` / CAS pattern from GUARDRAILS §2.

   - **`escrow/release.test.ts`** — tests for `releaseOrder` / `confirmReceipt` in
     `src/server/services/escrow.ts`:
     - Happy path: a DELIVERED order transitions to COMPLETED; the seller's `heldMinor` decreases;
       a `CREDIT` `LedgerEntry` is created for the seller; the platform fee `LedgerEntry` is
       created (check `docs/FEES.md` for the exact amount).
     - Double-confirm idempotent: calling `confirmReceipt` twice on the same order must not
       double-credit the seller. Assert `LedgerEntry` count for that order is unchanged after the
       second call.
     - Dispute freeze: an order in `DISPUTED` status must not be releasable. Assert the service
       throws with a message containing "disputed" (case-insensitive) when called on a DISPUTED
       order.

   - **`escrow/refund.test.ts`** — tests for `refundOrder` / `resolveDispute` refund path in
     `src/server/services/escrow.ts`:
     - Reverse hold: a refund on a PAID/IN_PROGRESS order releases the buyer's `heldMinor` back
       to `availableMinor`; creates a `DEBIT` + `CREDIT` pair in `LedgerEntry`; order status
       moves to `CANCELLED` (or the appropriate refund terminal state — check the state machine).
     - Restock: if the listing has `deliveryType === "INSTANT"` (or the auto-delivery type),
       assert the listing's `stock` is incremented back by the order quantity after refund (per
       the GUARDRAILS §3 note that stock is decremented at payment and restored on refund).
     - Refund on COMPLETED order must throw (can't refund a completed order without admin
       override).

   - **`payouts/withdraw.test.ts`** — tests for payout reservation in
     `src/server/services/payouts.ts`:
     - Reserve: `requestPayout(sellerId, amountMinor)` creates a `Payout` record, creates a
       `LedgerEntry` of kind `PAYOUT_HOLD` (or equivalent), and decrements `availableMinor` on
       the seller wallet. Assert all three.
     - Concurrent one-wins: two concurrent `requestPayout` calls for the same seller for the
       full `availableMinor` balance. Exactly one must succeed; the other must throw
       "insufficient balance" (or equivalent). Assert the wallet balance is not negative after
       both settle.
     - FAILED reversal: marking a payout as `FAILED` reverses the `PAYOUT_HOLD` and restores
       `availableMinor`. Assert the reversal `LedgerEntry` exists and the wallet balance is
       restored to the pre-payout value.

   - **`reviews/rating.test.ts`** — tests for `createReview` in `src/server/services/reviews.ts`:
     - Concurrent serialized: two concurrent `createReview` calls for the same seller from two
       different buyers (both legitimate). Both must succeed; `SellerProfile.ratingCount` must
       equal 2; `ratingAvg` must be the correct mean of the two submitted ratings. This tests the
       `SELECT … FOR UPDATE` on `SellerProfile` from GUARDRAILS §4.
     - Average correct: after 3 reviews with ratings 3, 4, 5, assert `ratingAvg` is `4.00`
       (or the closest representable value in the schema).
     - Duplicate review blocked: the same buyer reviewing the same seller for the same order
       twice must throw (assert the error). The `ratingCount` must not increment.

5. **Playwright E2E tests — `e2e/`**
   All specs run against `http://localhost:3000` (started by `webServer` in `playwright.config.ts`).
   Use Playwright's built-in `page`, `expect`, `test` — no extra assertion libraries. Store
   reusable helpers (login flow, buyer setup) in `e2e/helpers/auth.ts`. Use `test.use({ storageState })` for session reuse where appropriate.

   - **`e2e/auth.spec.ts`**:
     - Register flow: fill the registration form with a unique test email
       (`test_e2e_${Date.now()}@example.com`), submit, land on the email-verification page.
       Assert the success message is visible.
     - Login flow: use the existing test account (`test.buyer@getx.live` / `GetxTest123` from
       Step 03 MEMORY) to log in. Assert the dashboard or home page loads with the user's name
       or avatar visible.
     - Logout: click logout, assert the login button is visible and the user name is gone.
     - Wrong password: assert the error message is visible; page does not crash.

   - **`e2e/marketplace.spec.ts`**:
     - Browse: navigate to `/listing` (or the marketplace URL). Assert at least one listing card
       is visible.
     - Filter: click a game filter chip (e.g., "Pokemon GO"). Assert the URL updates with the
       game param and only relevant listings are shown (or a "no results" message if the test DB
       has none — both are acceptable).
     - Search: type "account" in the search input. Assert the URL contains `q=account` and the
       page updates.
     - Listing detail: click the first listing card. Assert the listing detail page loads with
       a title, price, and "Buy" or "Add to cart" button visible.

   - **`e2e/checkout.spec.ts`**:
     - Checkout loads: log in as the test buyer, navigate to a listing detail page, click the
       Buy button. Assert the checkout page (`/checkout` or the checkout modal/drawer) is
       visible with a price breakdown.
     - Fee breakdown: assert the checkout page shows both the item price and the platform fee
       line item (e.g., "Platform fee (5%)"). Assert the total is price + fee.
     - Note: do NOT complete a real payment in E2E — assert only up to the payment gateway
       redirect or the "Proceed to payment" button being enabled.

   - **`e2e/seller.spec.ts`**:
     - Become seller: log in as the test seller account (`test.seller@getx.live`). Navigate to
       the "Become a seller" flow. Assert the seller dashboard is accessible.
     - Create listing: on the seller dashboard, click "New listing". Fill the form with test
       data (title, price in valid minor units, select a category). Submit. Assert a success
       toast or redirect to the new listing page.
     - Appears on marketplace: navigate to the marketplace. Assert the newly created listing
       title is visible (search for it if needed).

   - **`e2e/mobile.spec.ts`** (viewport `375 × 812`, `devices["iPhone 12"]`):
     - Home page loads and the mobile navigation hamburger/drawer is visible.
     - Marketplace loads; listing cards are visible and not overflowing horizontally.
     - Listing detail page loads; the Buy button is tappable (not hidden or clipped).
     - Login page renders correctly; form fields are accessible.

6. **Coverage gate**
   - `npm run test:coverage` must exit 0 only when `lines`, `functions`, `branches`, and
     `statements` are all ≥ 80 % on the `coverage.include` paths (`src/server/services/**`,
     `src/lib/**`).
   - Add the coverage report output directory (`coverage/`) to `.gitignore`.
   - The coverage check runs in CI (see Task 7). If coverage drops below 80 %, the CI job fails.
   - Document the coverage targets in `docs/DECISIONS.md`.

7. **CI configuration** (`.github/workflows/ci.yml`)
   - Create the GitHub Actions workflow file. It must trigger on `push` and `pull_request` for
     all branches.
   - Jobs (each is a separate job that runs in parallel where possible):
     - `typecheck`: `npm run typecheck` (fails fast if TypeScript errors).
     - `lint`: `npm run lint` (fails fast if ESLint errors).
     - `unit`: `npm run test -- --project=unit` — runs only the unit project.
     - `integration`: runs only the integration project. Requires `TEST_DATABASE_URL` as a
       GitHub Actions secret (`secrets.TEST_DATABASE_URL`). Passes it as an environment variable.
       Runs `npx prisma migrate deploy` before the tests (or relies on `setup.ts` to do it).
     - `coverage`: `npm run test:coverage` — enforces the 80 % gate. Uploads the coverage
       report as an artifact (`actions/upload-artifact`).
     - `e2e`: installs Playwright browsers (`npx playwright install --with-deps chromium`),
       starts the dev server via `webServer` (Playwright handles it), runs
       `npm run test:e2e`. Uploads `playwright-report/` as an artifact on failure.
   - Node version: `20.x` (LTS). Use `actions/setup-node@v4`.
   - Cache `node_modules` with `actions/cache@v4` keyed on `package-lock.json` hash.
   - Never expose `DATABASE_URL` (prod) in CI — only `TEST_DATABASE_URL` for integration tests.
   - Document the CI setup in `docs/DECISIONS.md`.

8. **Migrate existing QA harnesses**
   - The existing `scripts/qa-step*.ts` files are the source of truth for the test scenarios in
     Task 4 (integration tests). Do NOT delete them — they are useful for local manual runs
     against the dev DB. Instead, extract the core assertion logic into the new integration
     test files in `src/__tests__/integration/` so the scenarios are also covered in CI.
   - For each integration test file in Task 4, add a comment at the top:
     ```
     // Derived from scripts/qa-stepXX.ts — see that file for the manual run harness
     ```
   - The `ok()` / `threw()` helper pattern from the QA harnesses should be replaced with
     Vitest's `expect().resolves` / `expect().rejects.toThrow()` equivalents.

9. **Edge cases**
   - `TEST_DATABASE_URL` absent: the integration `setup.ts` throws immediately with a clear
     message before any test runs. Unit tests are unaffected (they never read `TEST_DATABASE_URL`).
   - Test data leakage: every integration test cleans its own rows in `afterAll`. If a test
     crashes mid-run, the `afterAll` still runs (Vitest always calls `afterAll` even on
     failure). Namespaced IDs (e.g., `test_e2e_${timestamp}`) prevent collisions with real data.
   - Socket.io server absent: Playwright E2E tests must not require the Railway socket server to
     be running locally. If chat features are tested, mock the Socket.io connection or skip with
     `test.skip("socket server not available in CI")`.
   - Flaky E2E tests: use `await expect(locator).toBeVisible({ timeout: 10_000 })` with explicit
     timeouts instead of `page.waitForTimeout`. Retry count is set to 2 in CI (`retries: process.env.CI ? 2 : 0`).
   - Playwright browser download in CI: use `npx playwright install --with-deps chromium` (Chromium
     only in CI to keep install time under 60 s). Firefox and Mobile Safari run only locally.
   - `vitest.config.ts` path aliases must exactly match `tsconfig.json` `paths` — a mismatch
     causes silent resolution failures in tests that pass locally but fail in CI.
   - Coverage includes `src/lib/**` but must exclude generated files (`src/lib/generated/**` if
     any Prisma client output lands there). Add an `exclude` entry in the coverage config.
   - Next.js RSC modules (those using `"use server"` or `"use client"` directives) imported in
     unit tests may fail if the Vitest jsdom environment doesn't handle Next.js transforms. Use
     `vi.mock` for any module that imports Next.js internals (`next/headers`, `next/navigation`,
     `next/cache`) to avoid jsdom crashes.

### Rules
- **No test may touch the production or development `DATABASE_URL`.** Integration tests must
  read only `TEST_DATABASE_URL`. The `setup.ts` guard must throw before any Prisma query if
  `TEST_DATABASE_URL` is absent.
- **Money invariants must be verified in integration tests, not just units.** The double-credit
  (idempotency) and concurrent-one-wins (CAS/FOR UPDATE) scenarios in Tasks 4a–4d are
  non-negotiable — they guard the append-only ledger and escrow guarantees from
  ENGINEERING-GUARDRAILS §1–§3.
- **Coverage gate is a hard CI blocker.** `npm run test:coverage` must exit non-zero if any
  metric on `src/server/services/**` or `src/lib/**` drops below 80 %. Do not merge PRs that
  lower coverage.
- **E2E tests must never complete a real payment.** Assert only up to the payment gateway
  redirect / "Proceed" button. Never call CoinGate or Razorpay APIs in tests.

### Report back
CLAUDE.md output format + QA CHECKLIST below. Also include a short **test suite summary report**:
total unit tests, integration tests, E2E tests, final coverage percentage for services + lib.

---

## ✅ QA CHECKLIST
- [ ] `npm install` succeeds with all new test dependencies; no peer-dep conflicts
- [ ] `vitest.config.ts` present; `@/` alias resolves correctly; `unit` and `integration` projects defined
- [ ] `playwright.config.ts` present; `webServer` starts `npm run dev` on port 3000; `retries: 2` in CI
- [ ] `.env.test` added (gitignored); `TEST_DATABASE_URL=` key added to `.env.example`
- [ ] `src/__tests__/integration/setup.ts` throws clearly when `TEST_DATABASE_URL` is absent
- [ ] Integration `setup.ts` runs `prisma migrate deploy` (not `migrate dev`) against test DB
- [ ] **Unit — fees**: `computeBuyerFee`, `computeSellerCommissionMinor`, rounding half-up, reconciliation all pass
- [ ] **Unit — encryption**: round-trip, wrong key, empty string, missing key all pass
- [ ] **Unit — trust score**: all 6 signals, boundaries, clamp `[0, 100]` all pass
- [ ] **Unit — orders state machine**: allowed and rejected transitions all pass
- [ ] **Unit — fraud radar**: one test per rule, trigger and non-trigger cases all pass
- [ ] **Unit — loyalty**: earn, redeem, balance, idempotency all pass
- [ ] **Integration — payments**: PAID+hold, duplicate no-op, concurrent-one-wins all pass on test DB
- [ ] **Integration — escrow release**: happy path, double-confirm idempotent, dispute freeze all pass
- [ ] **Integration — escrow refund**: reverse hold, restock, refund-on-COMPLETED throws all pass
- [ ] **Integration — payouts**: reserve, concurrent-one-wins, FAILED reversal all pass
- [ ] **Integration — reviews**: concurrent serialized, average correct, duplicate blocked all pass
- [ ] No integration test row leaks to prod DB; all test data cleaned in `afterAll`
- [ ] **E2E — auth**: register, login, logout, wrong password all pass on Desktop Chrome
- [ ] **E2E — marketplace**: browse, filter, search, listing detail all pass
- [ ] **E2E — checkout**: page loads, fee breakdown visible, no real payment triggered
- [ ] **E2E — seller**: become seller, create listing, appears on marketplace all pass
- [ ] **E2E — mobile (375px)**: home, marketplace, listing detail, login all render correctly
- [ ] `npm run test:coverage` exits 0; coverage ≥ 80 % on `src/server/services/**` + `src/lib/**`
- [ ] Coverage report uploaded as CI artifact; `coverage/` in `.gitignore`
- [ ] `.github/workflows/ci.yml` present; all 6 jobs (typecheck, lint, unit, integration, coverage, e2e) trigger on push + PR
- [ ] CI `integration` job uses `secrets.TEST_DATABASE_URL`; `DATABASE_URL` (prod) is NOT in CI env
- [ ] CI `e2e` job uploads `playwright-report/` artifact on failure
- [ ] Existing `scripts/qa-step*.ts` harnesses are preserved (not deleted)
- [ ] Integration test files have `// Derived from scripts/qa-stepXX.ts` comment
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive (Playwright mobile spec passes)
- [ ] Step 34 ticked in `docs/ROADMAP.md`; key choices (coverage targets, CI setup, test DB strategy) logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Tell me **"Step 34 done"** → **Step 35 — Deploy** (production deploy to Vercel + Railway + Neon
prod branch, environment variable audit, smoke test on the live URL, DNS setup for getx.live).

## 🔑 Tokens needed: **`TEST_DATABASE_URL`** (a separate Neon branch — create one in the Neon console and paste the pooled connection string here; never use the dev or prod branch for tests).
