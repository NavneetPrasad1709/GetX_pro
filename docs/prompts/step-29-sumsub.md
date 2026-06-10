# STEP 29 — Sumsub Automated KYC/AML

> Goal: Replace manual KYC (Step 15) with Sumsub's automated liveness + document verification.
> Sellers complete ID verification inside an embedded SDK modal; a webhook updates `kycStatus`
> automatically. Manual fallback stays active when keys are absent.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Full-Stack Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §5, §7). Work in `D:\GetX`. This is
**Step 29 — Sumsub Automated KYC/AML**. Talk Hinglish. Follow the full workflow.

### Task

1. **Environment variables + graceful feature flag**:

   Add to `.env.example` (keys only, no real values):
   ```
   SUMSUB_APP_TOKEN=         # Sumsub REST API app token
   SUMSUB_SECRET_KEY=        # Sumsub HMAC-SHA256 signing secret
   SUMSUB_BASE_URL=https://api.sumsub.com
   ```
   Read these in `src/config/site.ts` (or a new `src/lib/sumsub-config.ts`) with:
   ```ts
   export const SUMSUB_ENABLED =
     !!process.env.SUMSUB_APP_TOKEN && !!process.env.SUMSUB_SECRET_KEY;
   ```
   Every Sumsub code path must check `SUMSUB_ENABLED` first. When the flag is `false` the
   existing Step 12 manual upload flow is shown with a "Manual review (1–2 business days)"
   banner — no crashes, no leaked env errors, no dead screens.

2. **Database migration** (`prisma/schema.prisma` + new migration folder
   `prisma/migrations/20260610120000_step29_sumsub/`):

   - Add two optional fields to `User`:
     ```prisma
     sumsubApplicantId  String?   // Sumsub applicant external id; set on first createApplicant call
     sumsubReviewedAt   DateTime? // timestamp of the last applicantReviewed webhook event
     @@index([sumsubApplicantId])
     ```
   - Generate the migration using the interactive-safe workflow:
     `npx prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma --script`
     → paste the output SQL into the hand-written migration file → run `npx prisma migrate deploy`.
     Do **NOT** run `prisma migrate dev` (interactive, will hang in CI/scripts).

3. **Sumsub service** (`src/server/services/kyc-sumsub.ts`):

   All HTTP calls use plain `fetch` (no SDK), identical to the CoinGate/Razorpay pattern.
   Every request is HMAC-SHA256 signed:
   ```
   X-App-Token: <SUMSUB_APP_TOKEN>
   X-App-Access-Sig: HMAC-SHA256(timestamp + method + url + body, SUMSUB_SECRET_KEY) as hex
   X-App-Access-Ts: <unix seconds>
   Content-Type: application/json
   ```

   Implement and export:

   a. **`createApplicant(userId: string, email: string, phone?: string): Promise<string>`**
      - `POST /resources/applicants?levelName=basic-kyc-level` with body
        `{ externalUserId: userId, email, phone }`.
      - Parse the `id` field from the JSON response — this is the `applicantId`.
      - `UPDATE User SET sumsubApplicantId = applicantId WHERE id = userId` via Prisma inside a
        transaction that also sets `SellerProfile.kycStatus = 'PENDING'` and writes an `AuditLog`
        row (`action: 'SUMSUB_APPLICANT_CREATED'`).
      - Idempotent: if `User.sumsubApplicantId` is already set, skip the Sumsub API call and
        return the existing id.
      - Throws `KycSumsubError` on non-2xx Sumsub responses (include status + body in message).

   b. **`generateSDKToken(applicantId: string, userId: string): Promise<string>`**
      - `POST /resources/accessTokens?userId=${applicantId}&levelName=basic-kyc-level`.
      - Parse and return `token` from the JSON response.
      - Token is short-lived (Sumsub default ~30 min); do not cache it.
      - The caller (Server Action) must verify the requesting user owns the applicantId:
        `User.sumsubApplicantId === applicantId`.

   c. **`getApplicantStatus(applicantId: string): Promise<SumsubReviewStatus>`**
      ```ts
      type SumsubReviewAnswer = 'GREEN' | 'RED' | null;
      type SumsubReviewStatus = {
        reviewAnswer: SumsubReviewAnswer;
        reviewResult?: { rejectLabels?: string[] };
      };
      ```
      - `GET /resources/applicants/${applicantId}/requiredIdDocsStatus`.
      - Return `{ reviewAnswer: null }` when review is not yet complete (status `pending` /
        `queued` / `onHold`).
      - Parse `reviewResult.reviewAnswer` → `'GREEN'` | `'RED'` | `null`. Zod-validate the
        shape before returning; on parse error return `{ reviewAnswer: null }` and log to Sentry.

4. **Server Actions** (`src/server/actions/kyc-sumsub.ts`):

   a. **`getOrCreateApplicantAction(): Promise<{ applicantId: string; sdkToken: string } | { error: string }>`**
      - Auth: `auth()` — reject if not signed in or not SELLER role.
      - If `SUMSUB_ENABLED` is `false`, return `{ error: 'sumsub_disabled' }`.
      - Call `createApplicant(user.id, user.email, user.phone ?? undefined)`.
      - Call `generateSDKToken(applicantId, user.id)`.
      - Return `{ applicantId, sdkToken }`.
      - On any `KycSumsubError`, capture with Sentry and return `{ error: 'sumsub_error' }`.

   b. **`pollKycStatusAction(): Promise<{ status: KycStatus }>`**
      - Auth: `auth()` — reject if not SELLER.
      - Reads `User.sumsubApplicantId` from DB. If absent, return `{ status: 'NONE' }`.
      - Calls `getApplicantStatus(applicantId)`.
      - If `reviewAnswer === 'GREEN'` and current `kycStatus !== 'APPROVED'`: update
        `SellerProfile.kycStatus = 'APPROVED'`, set `User.sumsubReviewedAt = now()`, write
        `AuditLog` (`action: 'KYC_APPROVED', meta: { source: 'sumsub_poll' }`), all in one
        transaction.
      - If `reviewAnswer === 'RED'` and current `kycStatus !== 'REJECTED'`: same but REJECTED.
      - Return the current (post-update if changed) `kycStatus`.
      - This action is called client-side every 10 seconds for up to 5 minutes after SDK
        `onComplete` fires. After 5 minutes (30 polls), stop polling and show
        "Verification under review — we'll notify you shortly."

5. **Webhook handler** (`src/app/api/webhooks/sumsub/route.ts`):

   - `POST` only. Read the raw body with `req.text()` (not `req.json()`; raw bytes needed for
     HMAC). Respond immediately with `200 OK` after signature check (Sumsub retries on non-2xx).

   - **Signature verification** (fail-closed: 401 on any failure):
     ```
     digest = HMAC-SHA256(rawBody, SUMSUB_SECRET_KEY) as hex lowercase
     expected header: x-payload-digest
     if digest !== header → return 401
     ```
     If `SUMSUB_SECRET_KEY` is absent, return 401 immediately — never process unsigned events.

   - **Idempotency** via `ProcessedWebhook` (same pattern as CoinGate/Razorpay):
     ```ts
     const eventId = `sumsub:${body.applicantId}:${body.type}:${body.reviewResult?.reviewAnswer ?? 'NA'}:${body.createdAt}`;
     // Upsert-or-skip with unique constraint
     ```
     On duplicate: return `200` immediately without re-processing.

   - **`applicantReviewed` event handling** (only event we care about):
     ```ts
     if (body.type === 'applicantReviewed') {
       const answer = body.reviewResult?.reviewAnswer; // 'GREEN' | 'RED'
       // Look up User by sumsubApplicantId = body.applicantId
       // In one transaction (SELECT … FOR UPDATE on SellerProfile):
       //   - If GREEN and kycStatus !== 'APPROVED': set APPROVED, sumsubReviewedAt
       //   - If RED   and kycStatus !== 'REJECTED': set REJECTED, sumsubReviewedAt
       //   - Write AuditLog: action 'KYC_APPROVED'/'KYC_REJECTED', meta: { source: 'sumsub_webhook', rejectLabels }
     }
     ```
     Any other `body.type`: log and return 200 (no-op, forward-compatible).

   - All DB work inside a single `db.$transaction`. Catch + Sentry-capture on error, return 500
     so Sumsub retries — never swallow errors silently.

   - Parse and validate the incoming JSON body with Zod before accessing any field:
     ```ts
     const SumsubWebhookSchema = z.object({
       type: z.string(),
       applicantId: z.string(),
       createdAt: z.string(),
       reviewResult: z.object({
         reviewAnswer: z.enum(['GREEN', 'RED']).optional(),
         rejectLabels: z.array(z.string()).optional(),
       }).optional(),
     });
     ```
     On Zod failure: log to Sentry, return 400.

6. **Become-seller KYC page** (`src/app/(dashboard)/seller/verify/page.tsx` and any related
   client component `src/components/seller/sumsub-kyc-widget.tsx`):

   - The existing `/seller/verify` page already handles the Step 12 manual upload flow.
     Extend it: if `SUMSUB_ENABLED` is `true`, show the Sumsub flow instead of the R2 upload form.

   - Install the Sumsub Web SDK: `npm install @sumsub/websdk-react`.

   - Create `src/components/seller/sumsub-kyc-widget.tsx` — a `"use client"` component:
     - On mount, call `getOrCreateApplicantAction()`. On `{ error: 'sumsub_disabled' }`, render
       `null` (parent shows manual flow). On `{ error: 'sumsub_error' }`, show a toast +
       "Try again" button.
     - On success, render `<SumsubWebSdk accessToken={sdkToken} ... />` with:
       - `onMessage`: log SDK events (no-op for now; useful for debugging).
       - `onError`: capture with Sentry; show toast "Verification failed — please try again."
       - `onComplete` (SDK fires when the user finishes the document + liveness flow): start
         polling `pollKycStatusAction()` every 10 seconds. Show a spinner with
         "Verifying your identity…" while polling.
     - After polling resolves to `APPROVED`: show a green success banner
       "Identity verified! You can now create listings." and call `router.refresh()`.
     - After polling resolves to `REJECTED`: show a red banner
       "Verification failed. Please contact support." with a mailto link.
     - After 30 failed polls (5 minutes): show "Verification under review — we'll notify you
       shortly." Stop polling.
     - SDK modal is full-screen on mobile (Sumsub handles this internally). Ensure the
       container div is `w-full min-h-[600px]` so the iframe has room.

   - When `SUMSUB_ENABLED` is `false` (keys absent): show the existing R2-upload manual KYC
     form with a yellow info banner:
     "Automated verification is unavailable. Upload your ID for manual review (1–2 business days)."

7. **Admin panel — applicant deep-link** (`src/app/admin/users/[id]/page.tsx` or the existing
   admin user detail component):

   - In the KYC section of the admin user detail page, if `User.sumsubApplicantId` is set,
     add a labelled link:
     `https://cockpit.sumsub.com/applicants/${applicantId}/basicInfo`
     Opened in a new tab with `rel="noopener noreferrer"`. Label: "View in Sumsub Cockpit ↗".
   - Manual `reviewKyc` approve/reject still works regardless of whether Sumsub is active —
     admin override must always be available.
   - Show `sumsubReviewedAt` (formatted local time) next to the KYC status badge if present.

8. **Validators** (`src/lib/validators/kyc-sumsub.ts`):

   Export Zod schemas used by both the service and the webhook:
   - `SumsubWebhookSchema` (as defined in task 5).
   - `SumsubApplicantResponseSchema` for the `createApplicant` response: `z.object({ id: z.string() })`.
   - `SumsubTokenResponseSchema` for the `generateSDKToken` response: `z.object({ token: z.string() })`.
   - `SumsubStatusResponseSchema` for `getApplicantStatus` — parse the nested `review.reviewAnswer`
     field (Sumsub's actual endpoint shape); degrade to `{ reviewAnswer: null }` on any mismatch.

9. **QA harness** (`scripts/qa-step29.ts`):

   Run via `npx tsx scripts/qa-step29.ts` against the real dev DB. Follow the repo convention:
   `ok(label, condition)` / `threw(label, fn)` helpers; all test data cleaned up in a `finally` block.
   Seed a test seller user (or reuse `test.seller@getx.live`) for DB assertions.

   Cover:
   - **Webhook: valid GREEN signature** — compute a real HMAC of the test payload using
     `SUMSUB_SECRET_KEY` from `.env`; call `POST /api/webhooks/sumsub` with the correct
     `x-payload-digest` header; assert HTTP 200 and `SellerProfile.kycStatus === 'APPROVED'`.
   - **Webhook: invalid signature** — send wrong `x-payload-digest`; assert HTTP 401.
   - **Webhook: missing signature header** — omit the header entirely; assert HTTP 401.
   - **Webhook: GREEN → APPROVED transition** — confirm `AuditLog` row written with
     `action === 'KYC_APPROVED'` and `meta.source === 'sumsub_webhook'`.
   - **Webhook: RED → REJECTED transition** — same payload but `reviewAnswer: 'RED'`; assert
     `kycStatus === 'REJECTED'` and the correct AuditLog action.
   - **Webhook: duplicate event (idempotent)** — send the same payload twice; assert `kycStatus`
     is still `'APPROVED'` and only one `AuditLog` row exists (count check).
   - **Webhook: unknown type** — payload with `type: 'applicantCreated'`; assert HTTP 200 and
     no kycStatus change.
   - **`createApplicant` idempotent** — if `User.sumsubApplicantId` already set, must not call
     the Sumsub API a second time (mock the fetch or verify applicantId unchanged).
   - **Fallback when keys absent** — temporarily unset `SUMSUB_APP_TOKEN` in env; assert
     `SUMSUB_ENABLED === false`; assert calling `getOrCreateApplicantAction()` returns
     `{ error: 'sumsub_disabled' }` without throwing; assert the webhook handler returns 401.
   - **Zod validation of webhook body** — send a webhook with missing `applicantId` field; assert
     HTTP 400 and no DB mutations.

10. **Edge cases**:
    - `sumsubApplicantId` absent on a User when the webhook fires (Sumsub sent the wrong externalId
      or the user record was deleted): log a warning to Sentry, return 200 (don't let Sumsub retry
      forever on a deleted user), write no DB rows.
    - Sumsub API is down when `createApplicant` is called: `KycSumsubError` bubbles to the Server
      Action, which returns `{ error: 'sumsub_error' }` and shows a user-visible toast. The seller
      can retry manually; `SellerProfile.kycStatus` stays unchanged.
    - Poll action called when `sumsubApplicantId` is null (e.g., user navigated back after a failed
      `createApplicant`): return `{ status: 'NONE' }` cleanly.
    - Admin opens user detail with `SUMSUB_ENABLED = false` but `sumsubApplicantId` is populated
      (was set while keys were active): still show the Sumsub Cockpit deep-link (the id is valid
      data regardless of current feature flag state).
    - Sumsub sends a `reviewAnswer` value we don't recognise (future API change): Zod enum parse
      fails; log to Sentry, return 400 (safe no-op).
    - `generateSDKToken` fails mid-flow (expired app token, rate limit): Server Action returns
      `{ error: 'sumsub_error' }`; widget shows "Try again" — never leave the page in a broken
      silent state.

### Rules
- **Webhook is fail-closed on signature.** `SUMSUB_SECRET_KEY` absent → 401 immediately. Wrong
  digest → 401 immediately. Never process an unverified event.
- **Money + KYC mutations inside `db.$transaction` with `SELECT … FOR UPDATE`** on `SellerProfile`
  to prevent race conditions between the webhook and the poll action.
- **`@sumsub/websdk-react` is client-side only.** Never import it in a Server Component or Server
  Action — use dynamic import with `ssr: false` if co-located with an RSC layout.
- **Graceful degradation is non-negotiable.** `SUMSUB_ENABLED = false` must produce a fully
  functional manual-KYC experience — no dead routes, no console errors, no blank screens.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] `User.sumsubApplicantId` and `User.sumsubReviewedAt` fields added; `npx prisma migrate deploy` succeeds
- [ ] `SUMSUB_ENABLED = false` (keys absent): `/seller/verify` shows manual upload form + yellow fallback banner; no crashes, no console errors
- [ ] `SUMSUB_ENABLED = true`: Sumsub SDK modal renders on `/seller/verify`; camera/doc flow launches
- [ ] `createApplicant` called twice for same userId returns same `applicantId` (idempotent — no duplicate Sumsub API call)
- [ ] `pollKycStatusAction` after GREEN status: `SellerProfile.kycStatus` transitions to `APPROVED`; AuditLog row written
- [ ] Polling timeout (30 polls): shows "Verification under review" message; polling stops
- [ ] Webhook `POST /api/webhooks/sumsub` returns 401 with wrong `x-payload-digest`
- [ ] Webhook returns 401 with missing `x-payload-digest` header
- [ ] Webhook GREEN → `kycStatus = APPROVED`; AuditLog `action = 'KYC_APPROVED'`, `meta.source = 'sumsub_webhook'`
- [ ] Webhook RED → `kycStatus = REJECTED`; AuditLog `action = 'KYC_REJECTED'`
- [ ] Duplicate webhook (same event payload sent twice): second call is a no-op (ProcessedWebhook dedupe); kycStatus unchanged; AuditLog count = 1
- [ ] Unknown webhook type (e.g. `applicantCreated`): returns 200; no DB mutations
- [ ] Malformed webhook body (missing `applicantId`): returns 400; no DB mutations
- [ ] `sumsubApplicantId` absent on User when webhook fires: returns 200; Sentry warning; no crash
- [ ] Admin user detail page shows "View in Sumsub Cockpit ↗" link when `sumsubApplicantId` is set
- [ ] Admin manual override (`reviewKyc` approve/reject) still works independently of Sumsub state
- [ ] `scripts/qa-step29.ts` passes all checks (GREEN/RED/dup/badSig/missingSig/noKeys/unknownType/badBody)
- [ ] `typecheck`/`lint`/`build` pass; `/seller/verify` is mobile responsive (SDK modal, fallback form)
- [ ] Step 29 ticked in `docs/ROADMAP.md`; key choices logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Move to **Step 30 — More Games** (expand the catalog beyond Pokémon GO: add Valorant, CS2, Clash
of Clans, and Free Fire with their categories, seed listings, and SEO landing pages).

## 🔑 Tokens needed: **`SUMSUB_APP_TOKEN`**, **`SUMSUB_SECRET_KEY`**
