# STEP 19 — Auto / Instant Delivery

> Goal: Zero-wait fulfillment for digital goods — sellers pre-load encrypted items; the moment
> an order is PAID, one item is atomically assigned and the buyer sees it instantly. No chat, no wait.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Full-Stack Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §5, §7). Work in `D:\GetX`. This is **Step 19 — Auto / Instant Delivery**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Database — `DeliveryItem` model + migration**

   Add to `prisma/schema.prisma`:

   ```prisma
   model DeliveryItem {
     id          String               @id @default(cuid())
     listingId   String
     listing     Listing              @relation(fields: [listingId], references: [id])
     sellerId    String
     seller      User                 @relation(fields: [sellerId], references: [id])
     content     String               // AES-256-GCM encrypted JSON; see src/lib/encryption.ts
     status      DeliveryItemStatus   @default(AVAILABLE)
     orderId     String?
     order       Order?               @relation(fields: [orderId], references: [id])
     deliveredAt DateTime?
     createdAt   DateTime             @default(now())

     @@index([listingId, status])
     @@index([orderId])
   }

   enum DeliveryItemStatus {
     AVAILABLE
     RESERVED
     DELIVERED
   }
   ```

   Also verify `Listing` already has `deliveryType` (`MANUAL | INSTANT`) — it does per Step 06.
   Add the `DeliveryItem` back-relation to `Listing`, `User`, and `Order` in the schema.

   Create the migration using the repo's interactive-safe workflow:
   ```
   npx prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/20260609130000_step19_delivery_items/migration.sql
   ```
   Review the generated SQL, then: `npx prisma migrate deploy`.
   Never run `prisma migrate dev` (it is interactive and breaks in this workflow).

2. **Encryption utility — `src/lib/encryption.ts`**

   Implement two exported functions using Node's built-in `crypto` module (no extra packages):

   - `encrypt(plaintext: string): string` — generates a random 12-byte IV, encrypts with
     AES-256-GCM using `DELIVERY_ENCRYPTION_KEY` (32-byte hex from env), and returns a single
     JSON string `{"iv":"<hex>","tag":"<hex>","ciphertext":"<hex>"}`.
   - `decrypt(stored: string): string` — parses that JSON, decrypts, returns plaintext.

   **Fail-closed rule**: if `DELIVERY_ENCRYPTION_KEY` is absent or not exactly 64 hex chars,
   both functions must `throw new Error("DELIVERY_ENCRYPTION_KEY not configured")` immediately —
   never silently degrade, never log the key value. This mirrors the Sentry/Turnstile pattern:
   the feature is unavailable, not broken in a data-leaking way.

   Export a `isEncryptionAvailable(): boolean` helper (key present + correct length) for
   feature-gating the seller upload UI and graceful 503 when the key is missing.

3. **Server service — `src/server/services/delivery.ts`**

   Business logic only; no HTTP/UI code. Key functions:

   - `addDeliveryItems(listingId: string, sellerId: string, plaintexts: string[]): Promise<number>`
     — validates ownership (`Listing.userId === sellerId`, `deliveryType === INSTANT`), encrypts
     each item, bulk-inserts via `prisma.deliveryItem.createMany`, returns count added.
   - `deleteDeliveryItem(itemId: string, sellerId: string): Promise<void>` — verifies ownership,
     only deletes AVAILABLE items (not DELIVERED/RESERVED).
   - `getDeliveryItemCount(listingId: string): Promise<number>` — count of AVAILABLE items.
   - `assignDeliveryItem(listingId: string, orderId: string, tx: PrismaTransaction): Promise<string>`
     — must be called inside an existing Prisma transaction. Uses
     `SELECT … FOR UPDATE SKIP LOCKED` via `tx.$queryRaw` to find and lock exactly ONE
     AVAILABLE item, marks it DELIVERED, sets `orderId` and `deliveredAt`, returns the
     **decrypted** plaintext. Throws `DeliveryStockoutError` (custom class) if none found.
   - `pauseListingOnStockout(listingId: string, tx: PrismaTransaction): Promise<void>` — sets
     `Listing.status = PAUSED` and writes an `AuditLog` row (action: `"auto_pause_stockout"`).
     Call this after a successful delivery that leaves 0 AVAILABLE items.

4. **Wire auto-delivery into `applyPaymentEvent` — `src/server/services/orders.ts`**

   Inside the existing `PAID` branch of `applyPaymentEvent` (which already runs in a DB
   transaction with `SELECT … FOR UPDATE` on the order):

   a. After the order transitions to PAID, check `order.listing.deliveryType === "INSTANT"`.
   b. If INSTANT: call `assignDeliveryItem(listingId, orderId, tx)` inside the same transaction.
      On success, create an `OrderDelivery` row (`{ orderId, content: decryptedPlaintext,
      deliveredAt: now() }`) inside the same transaction.
      Then — outside the transaction (do not block the payment tx) — call
      `pauseListingOnStockout` if `getDeliveryItemCount === 0`.
   c. On `DeliveryStockoutError`: do NOT fail the payment. Log a `FraudFlag` with
      `severity: LOW`, `reason: "auto_delivery_stockout"`, `orderId`. Fall through silently —
      the order remains PAID and becomes a MANUAL delivery. This ensures buyer money is never
      lost due to a seller's stock management failure.
   d. If `isEncryptionAvailable()` returns false when INSTANT delivery is attempted, treat it
      the same as a stockout (log FraudFlag, fall through to MANUAL). Never crash a payment.

5. **Seller UI — listing edit "Auto-delivery" tab**

   Location: `src/app/(dashboard)/seller/listings/[id]/edit/page.tsx` (or the existing edit
   form component). Add a conditional section that renders only when `deliveryType === INSTANT`
   and `isEncryptionAvailable()`.

   - **Upload area**: a `<Textarea>` for "one item per line" entry + an "Add items" button.
     On submit, call a new Server Action `addDeliveryItems` (in `src/server/actions/delivery.ts`)
     which validates ownership, calls the service, and revalidates the page.
   - **Stock count badge**: shows "⚡ X items ready" in the v10 blue (#4d7cfe). If count < 5,
     render a yellow `<Alert>` "Low stock — add more items before your listing sells out."
     If count === 0, render a red `<Alert>` "No items — listing is paused automatically."
   - **Item list**: show each AVAILABLE item as a masked row (display only the first 4 chars
     of plaintext + `…` — never show full content in the list). Each row has a "Delete" button
     which calls a `deleteDeliveryItem` Server Action. Confirm before delete.
   - **CSV upload** (optional stretch): accept a `.csv` file (single column, no header) and
     parse it client-side before submitting the same Server Action.
   - If the encryption key is missing, hide the entire section and show a neutral info banner
     ("Auto-delivery unavailable — contact support") — fail-closed, no crash.

6. **"⚡ Instant" badge — marketplace cards + listing detail**

   - In `src/components/marketplace/` listing card component: if `listing.deliveryType ===
     "INSTANT"` and `listing.status === "ACTIVE"`, render a small `<Badge>` with "⚡ Instant"
     in the v10 blue accent color.
   - In `src/app/(shop)/listing/[slug]/page.tsx`: show a larger callout near the "Buy" button —
     e.g., "⚡ **Instant delivery** — you'll get your item the moment payment confirms."
   - Do NOT show the badge if the listing has 0 AVAILABLE items (it will be PAUSED anyway, but
     guard defensively).

7. **Buyer order page — show decrypted delivery content**

   In `src/app/(dashboard)/orders/[id]/page.tsx` (the `getOrder` service already gates access
   to buyer/seller/admin only):

   - If `order.delivery` exists and `order.listing.deliveryType === "INSTANT"`, render a
     highlighted card: "Your delivery" with the decrypted `content` in a `<pre>` or monospace
     block + a "Copy to clipboard" button (client component, `navigator.clipboard.writeText`).
   - The content is decrypted server-side in the page's RSC data-fetch (`getOrder` or a new
     `getDeliveryContent(orderId, userId)` service call). Never pass the raw encrypted string
     to the client — decrypt on the server, send plaintext.
   - Show the card only when `order.status` is PAID, DELIVERED, or COMPLETED. Hide entirely
     for MANUAL delivery orders and for PENDING/CANCELLED orders.

8. **Server Actions — `src/server/actions/delivery.ts`**

   - `addDeliveryItemsAction(listingId, rawText)`: auth check → parse lines (trim, filter empty,
     dedupe) → max 500 items per call → call `delivery.addDeliveryItems` → revalidatePath.
   - `deleteDeliveryItemAction(itemId)`: auth check → call `delivery.deleteDeliveryItem` →
     revalidatePath.
   - Both actions use Zod for input validation. Both re-check session inside the action.

9. **Edge cases**

   - **Concurrent PAID events** for the same INSTANT listing: `SELECT … FOR UPDATE SKIP LOCKED`
     guarantees each order gets a unique item; if no item is available for a concurrent request,
     that order falls back to MANUAL.
   - **Seller uploads items to a PAUSED listing**: allowed — stock can be refilled. On next
     `addDeliveryItems` call that brings count > 0 while listing is PAUSED due to stockout,
     auto-unpause (set status back to ACTIVE) + AuditLog.
   - **MANUAL listing with DeliveryItems**: impossible by design (only INSTANT listings can have
     items). `addDeliveryItems` enforces `deliveryType === INSTANT` check.
   - **Encryption key rotation**: out of scope for MVP. Document in `docs/DECISIONS.md` that
     key rotation requires re-encrypting all `DeliveryItem.content` rows and should be done
     during a maintenance window.
   - **Very large item content**: validate max 10 000 characters per item at the service layer.
     Return a validation error listing which line(s) exceeded the limit.
   - **Missing key at runtime**: `isEncryptionAvailable()` returns false → seller upload tab
     hidden, INSTANT payment event falls back to MANUAL + FraudFlag. App never crashes.

10. **QA harness — `scripts/qa-step19.ts`**

    Follow the repo convention (real services, dev DB, `ok()`/`threw()` helpers, `finally` cleanup).
    Test cases must cover:

    - Encrypt → decrypt roundtrip produces identical plaintext.
    - `encrypt` called with missing key throws (fail-closed verified).
    - `addDeliveryItems` rejects non-owner seller.
    - `addDeliveryItems` rejects MANUAL-type listing.
    - PAID event on INSTANT listing → `OrderDelivery` row created, item marked DELIVERED.
    - PAID event on INSTANT listing → decrypted content matches original plaintext.
    - Content is NOT accessible via `getOrder` to a third-party user (authz gate).
    - Stockout (0 items) → PAID still succeeds, `FraudFlag` LOW created, no `OrderDelivery`.
    - Stockout → listing auto-paused, `AuditLog` row written.
    - **Concurrency test**: insert 2 AVAILABLE items, fire 3 parallel PAID events (via
      `Promise.all`), assert exactly 2 get `OrderDelivery`, 1 gets FraudFlag, no item delivered
      to two orders (uniqueness).
    - `deleteDeliveryItem` rejects deletion of DELIVERED items.
    - Auto-unpause when seller refills a PAUSED-due-to-stockout listing.

### Rules

- **Encryption is fail-closed**: missing or malformed `DELIVERY_ENCRYPTION_KEY` must throw immediately — never silently skip encryption or store plaintext. Mirror the Sentry/Turnstile graceful-unavailability pattern at the feature level, not at the crypto level.
- **Atomic assignment in the payment transaction**: `assignDeliveryItem` must run inside the same DB transaction as `applyPaymentEvent`'s order status update. A stockout must never fail a payment — fall through to MANUAL + FraudFlag.
- **Server-side decrypt only**: decrypted item content must never be stored in the DB in plaintext, never passed to the client as a raw encrypted blob, and never logged. Decrypt in the RSC server layer, send plaintext HTML to the authenticated buyer.
- **No `any`; strict TypeScript throughout.** Money-adjacent paths (order status, ledger) must go through existing services — do not duplicate escrow or ledger logic.

### Report back

CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST

- [ ] `encrypt` / `decrypt` roundtrip verified; missing key throws immediately (fail-closed)
- [ ] `DELIVERY_ENCRYPTION_KEY` absent → seller upload section hidden (graceful), INSTANT payment falls back to MANUAL + FraudFlag (no crash)
- [ ] `DeliveryItem` migration applied cleanly; `prisma migrate deploy` succeeds
- [ ] Seller can upload items (textarea + Server Action); items appear masked in the list; delete works
- [ ] Low-stock warning (<5) and zero-stock alert render correctly in seller UI
- [ ] "⚡ Instant" badge visible on listing cards and detail page for INSTANT listings
- [ ] PAID event on INSTANT listing → `OrderDelivery` created, buyer sees decrypted content on order page with copy button
- [ ] Decrypted content is NOT visible to a different authenticated user (authz gate confirmed)
- [ ] Stockout (0 items): PAID succeeds, `FraudFlag` LOW written, listing auto-paused, `AuditLog` written
- [ ] Seller refills a paused listing → listing auto-unpauses, `AuditLog` written
- [ ] Concurrency test: N parallel PAID events, each AVAILABLE item assigned to exactly one order (no duplicates)
- [ ] MANUAL listings cannot receive `DeliveryItem` uploads (service rejects)
- [ ] `typecheck` / `lint` / `build` pass; seller upload + buyer delivery card are mobile responsive
- [ ] Step 19 ticked in `docs/ROADMAP.md`; key decisions (encryption scheme, stockout fallback, concurrency lock) logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step

Move to **Step 20 — Seller CEO Dashboard**: real-time revenue charts, order funnel, trust score breakdown, top listings, and payout history — the "seller feels like a CEO" moment that drives retention.

## 🔑 Tokens needed: **`DELIVERY_ENCRYPTION_KEY`** — generate with `openssl rand -hex 32`, add to `.env` and Vercel/Railway env vars.
