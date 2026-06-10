# STEP 22 — Notifications (Email + In-app)

> Goal: Users stay informed via an in-app notification bell and Resend emails — order updates,
> new messages, dispute changes, payout status, and new reviews. Never blocks the happy path.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Frontend Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §5, §7). Work in `D:\GetX`. This is **Step 22 — Notifications**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Install & configure Resend**
   - `npm install resend` in the root Next.js project.
   - Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to `.env.example` (keys only) and to the local
     `.env` (real values). Document in `docs/DECISIONS.md`.
   - Create `src/lib/resend.ts`: instantiate a single `Resend` client (lazy singleton). Export a
     `resendClient()` helper that returns `null` when `RESEND_API_KEY` is absent — calling code
     must handle `null` gracefully (feature skipped, never crashes).

2. **Notification model — migration**
   - Check `prisma/schema.prisma` for any existing `Notification` model (may have been stubbed in
     Step 02). If it exists, extend it to match the canonical shape below; if not, add it fresh.
   - Canonical shape:
     ```prisma
     model Notification {
       id        String           @id @default(cuid())
       userId    String
       user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
       type      NotificationType
       title     String
       body      String
       link      String?
       read      Boolean          @default(false)
       createdAt DateTime         @default(now())

       @@index([userId, read])
       @@index([userId, createdAt])
     }

     enum NotificationType {
       ORDER_UPDATE
       NEW_MESSAGE
       DISPUTE
       PAYOUT
       REVIEW
       SYSTEM
     }
     ```
   - Add `notifications Notification[]` to the `User` model.
   - Also add `emailNotifications Boolean @default(true)` to the `User` model if not already present
     (needed for step 7).
   - Migration workflow (never use `migrate dev` — it is interactive): run
     `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --script`
     to preview; then hand-create the migration folder
     `prisma/migrations/20260609130000_step22_notifications/migration.sql` with the generated SQL;
     then `npx prisma migrate deploy` to apply; then `npx prisma generate`.

3. **Notification service** (`src/server/services/notifications.ts`)
   - `createNotification(data)`: inserts a `Notification` row using the Prisma singleton from
     `src/lib/db.ts`. Wraps the insert in `try/catch` — never throws, never blocks callers (fire
     and forget). Returns the created row or `null` on failure.
   - `sendEmail({ to, subject, html })`: wraps Resend. If `resendClient()` returns `null`, logs a
     `console.warn` and returns early — no throw, no crash. Wrap the `resend.emails.send()` call in
     `try/catch`; log errors, never propagate. Respect `User.emailNotifications`: query the user's
     preference before sending; skip silently if `false`.
   - Named trigger helpers (each calls `createNotification` + `sendEmail` internally):
     - `notifyOrderUpdate(userId, orderId, status)` — type `ORDER_UPDATE`
     - `notifyNewMessage(userId, conversationId, senderName)` — type `NEW_MESSAGE`
     - `notifyDisputeUpdate(userId, orderId, resolution?)` — type `DISPUTE`
     - `notifyPayoutUpdate(userId, payoutId, status)` — type `PAYOUT`
     - `notifyNewReview(userId, listingId, rating)` — type `REVIEW`
   - Export a convenience `broadcastNotification(userIds[], ...)` for future group sends.

4. **Email templates** (`src/lib/email-templates/`)
   - Create one plain-HTML template per notification type (6 files + a shared `layout.ts` wrapper).
   - Templates use **inline CSS only** (email clients strip `<style>` blocks). GETX v10 branding:
     dark background `#0f1117`, accent blue `#4d7cfe`, white body text, Poppins for headings
     (with Arial fallback), Inter/system-ui for body.
   - Each template includes: GETX logo text, heading, body paragraph, a CTA button (blue, inline
     style), and an unsubscribe placeholder footer:
     `You received this because you have an account at getx.live. <a href="{{unsubscribe_url}}">Unsubscribe</a>`.
   - `buildEmailHtml(template, vars)` interpolates `{{variable}}` placeholders using a simple
     `string.replace` loop — no template engine dependency.
   - Templates: `order-update.ts`, `new-message.ts`, `dispute-update.ts`, `payout-update.ts`,
     `new-review.ts`, `system.ts`.

5. **Integration — wire notifications into existing services**
   - `src/server/services/escrow.ts` → after `applyPaymentEvent` flips order to `PAID`, call
     `notifyOrderUpdate` for both buyer and seller.
   - `escrow.ts markDelivered` → `notifyOrderUpdate` to buyer (delivery pending confirmation).
   - `escrow.ts confirmReceipt` (order → `COMPLETED`) → `notifyOrderUpdate` to both parties.
   - `escrow.ts refund` → `notifyOrderUpdate` to buyer; `notifyDisputeUpdate` to both.
   - `escrow.ts resolveDispute` → `notifyDisputeUpdate` to both parties with resolution label.
   - `src/server/actions/chat.ts` (message persist) → `notifyNewMessage` to the **other** party
     (not the sender). Skip if sender === recipient (safety guard).
   - `src/server/services/kyc.ts reviewKyc` → `createNotification` type `SYSTEM` to the seller
     (approved/rejected outcome). Send a `SYSTEM` email.
   - `src/server/services/payouts.ts markPayoutPaid` / `markPayoutFailed` → `notifyPayoutUpdate`
     to the seller.
   - `src/server/actions/reviews.ts createReview` (Step 13) → `notifyNewReview` to the listing's
     seller.
   - All calls are fire-and-forget (do not `await` in the critical path; use `void` or wrap in
     `Promise.resolve().then(...).catch(console.error)` so errors never surface to the caller).

6. **In-app notification bell (header component)**
   - Add a `NotificationBell` client component at `src/components/layout/notification-bell.tsx`.
   - Mount it in `src/components/layout/site-header.tsx` next to the user menu (authenticated only).
   - Unread count: fetched via a Server Action `getUnreadCount(userId)` on initial render; displayed
     as a red badge (max shown: `99+`).
   - Dropdown: clicking the bell opens a shadcn `Popover`. Fetches last 10 notifications via
     `getNotifications(userId, limit: 10)`. Shows title, truncated body (1 line), relative time
     (use `date-fns/formatDistanceToNow`). Each row is clickable → marks that notification read
     (`markNotificationRead(id)` Server Action) + navigates to `notification.link` if set.
   - "Mark all read" button at the top of the dropdown → calls `markAllRead(userId)` Server Action.
   - Real-time update via Socket.io: the socket server broadcasts `notification:new` to a user's
     private room (`user:<userId>`). The `NotificationBell` listens for this event and increments
     the local unread count badge without a full refetch (optimistic +1).
   - Server Actions needed: `getNotifications`, `getUnreadCount`, `markNotificationRead`,
     `markAllRead` — place in `src/server/actions/notifications.ts`. All auth-check (`session.user.id
     === userId`). Use Prisma singleton.

7. **Email opt-out preference**
   - `User.emailNotifications` (added in step 2) defaults to `true`.
   - Add a toggle in the user settings page (wherever account settings live; create
     `src/app/(dashboard)/settings/notifications/page.tsx` if a dedicated page doesn't exist).
   - Server Action `updateEmailPreference(enabled: boolean)` — auth-checked, updates
     `User.emailNotifications`. Input validated with Zod.
   - `sendEmail` in the notification service queries this field before dispatching (Step 3 already
     covers this — confirm the query is present).

8. **QA harness** (`scripts/qa-step22.ts`)
   - Follow the repo convention: `npx tsx scripts/qa-step22.ts`, real services against the dev DB,
     `ok(label)` / `threw(label, fn)` helpers, cleaned-up test data in `finally`.
   - Test cases to cover:
     - `createNotification` inserts a row; returned object has correct type/title/read=false.
     - `notifyOrderUpdate` → row exists in DB for the target user.
     - `notifyNewMessage` → row exists; sender does NOT get a notification.
     - `notifyPayoutUpdate` → row exists.
     - `notifyNewReview` → row exists.
     - `sendEmail` with `RESEND_API_KEY` unset → does not throw, logs warn.
     - `getUnreadCount` returns correct integer after inserts.
     - `markNotificationRead` → flips `read = true`.
     - `markAllRead` → all rows for user have `read = true`.
     - `User.emailNotifications = false` → `sendEmail` skips (mock/spy or check no Resend call).
     - Socket broadcast mock: call the internal API endpoint `POST /api/internal/notify` with the
       correct `INTERNAL_API_SECRET` bearer token; assert 200 with `{ ok: true }` (the socket
       server picks this up via its own listener).

9. **Edge cases**
   - `RESEND_API_KEY` absent: every email path silently skips, never throws, never breaks orders/chat.
   - Notification for a deleted user: `onDelete: Cascade` on the FK handles DB side; service
     `createNotification` catches the foreign-key error and returns `null`.
   - Duplicate `notification:new` socket events (reconnect): bell increments by 1 per event;
     duplicate guard: store the last-seen notification `cuid` in component state and skip if already
     seen.
   - Unread count overflow: display `99+` when count > 99.
   - `markAllRead` on zero unread rows: Prisma `updateMany` with zero matches is a no-op — no error.
   - Long notification titles/bodies: truncate to 80/200 chars in the service before insert (add
     Zod `.max()` in the input shape to enforce this).
   - Missing `link`: render the dropdown row without the navigate-on-click behavior; still marks read.

### Rules
- `sendEmail` and `createNotification` must **never throw and never block the caller** — wrap in
  try/catch, fire-and-forget; any failure is logged, not surfaced.
- Money/escrow/order mutations in existing services must not be changed in semantics — only add the
  notification side-effect call (fire-and-forget) at the end of the success path.
- Every Server Action in `src/server/actions/notifications.ts` must re-verify `session.user.id ===
  userId` before touching data — no cross-user reads.
- No new npm dependencies beyond `resend` and (if not already present) `date-fns`.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] `npm install resend` succeeds; `RESEND_API_KEY` / `RESEND_FROM_EMAIL` in `.env.example`
- [ ] Notification model migration applied (`prisma migrate deploy`); `prisma generate` clean
- [ ] `User.emailNotifications` column present with default `true`
- [ ] `createNotification` inserts rows; `try/catch` verified — no throw on DB error
- [ ] `sendEmail` with key absent → logs warn, no throw; confirmed in QA harness
- [ ] `notifyOrderUpdate` fires on PAID / COMPLETED; DB row exists for both buyer and seller
- [ ] `notifyNewMessage` fires on chat persist; sender is NOT notified
- [ ] `notifyDisputeUpdate` fires on dispute open, resolve, and refund
- [ ] `notifyPayoutUpdate` fires on markPayoutPaid / markPayoutFailed
- [ ] `notifyNewReview` fires on createReview; seller receives the notification
- [ ] `reviewKyc` (admin approve/reject) sends a SYSTEM notification to seller
- [ ] Email templates render valid HTML with inline styles, GETX branding, unsubscribe placeholder
- [ ] `User.emailNotifications = false` → email skipped, in-app notification still created
- [ ] NotificationBell renders in header (auth only); unread badge shows correct count
- [ ] Dropdown lists last 10; relative timestamps; click → marks read + navigates to link
- [ ] "Mark all read" clears badge to 0
- [ ] Socket `notification:new` event increments bell badge in real time (manual socket test)
- [ ] Duplicate socket events do not double-increment (last-seen guard in place)
- [ ] Settings toggle updates `emailNotifications`; Server Action auth-checked
- [ ] `scripts/qa-step22.ts` — all assertions pass (run `npx tsx scripts/qa-step22.ts`)
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive (bell fits mobile header)
- [ ] Step 22 ticked in `docs/ROADMAP.md`; key choices logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Tell me **"Step 22 done"** → **Step 23 — i18n** (next-intl, locale routing, English + Hindi as
the first two locales, all static strings extracted).

## 🔑 Tokens needed: **`RESEND_API_KEY`**, **`RESEND_FROM_EMAIL`**.
