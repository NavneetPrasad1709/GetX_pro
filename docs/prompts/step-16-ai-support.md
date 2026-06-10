# STEP 16 — AI Support Bot (24/7)

> Goal: A floating chat widget powered by `claude-sonnet-4-6` that answers buyer/seller questions
> about orders, escrow, disputes, fees, and policies — with context injection and human escalation.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Frontend Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §7, §8). Work in `D:\GetX`. This is **Step 16 — AI Support Bot**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Claude API client** (`src/lib/ai.ts`):
   - Export a single Anthropic SDK client instance, initialised lazily from `process.env.ANTHROPIC_API_KEY`.
   - If the key is absent, export `null` (env-safe: every consumer checks before use).
   - Default model constant: `SUPPORT_MODEL = "claude-sonnet-4-6"`.
   - Export a thin `streamSupportResponse(messages, systemPrompt)` helper that calls
     `client.messages.stream(...)` and returns the raw `ReadableStream<string>` of text deltas.
   - Do NOT use the Vercel AI SDK — use the Anthropic SDK directly with native SSE (keeps the
     bundle clean; no additional dependency).

2. **API route** (`src/app/api/support/chat/route.ts`):
   - `POST` only, App Router handler.
   - Auth: if user is logged in, `getServerSession` → inject context; if not logged in, allow
     anonymous (guest support is a selling point).
   - Input schema (Zod): `{ messages: [{role, content}][], orderId?: string }` — validate strictly;
     content capped at 500 chars per message; max 20 messages in history.
   - **Rate limit**: 30 messages per hour per user (use `userId` when logged in, IP fallback for
     guests). Follow the existing limiter pattern in the codebase. Return 429 with
     `{ error: "Rate limit reached. Try again in an hour." }` on breach.
   - **Context injection** (server-side, never trust client): call a `getSupportContext(userId)`
     helper in `src/server/services/support.ts` that queries the DB via the Prisma singleton for
     the user's last 5 orders (id, status, total, createdAt, listing title) and any open disputes
     (id, status, orderId). Serialise to a compact string appended to the system prompt.
   - **System prompt** (`src/lib/support-prompt.ts`): GETX identity ("You are GETX Support AI, …"),
     escrow lifecycle (AWAITING_PAYMENT → CONFIRMED → DELIVERED → COMPLETED / DISPUTED / REFUNDED),
     fees summary (import `siteConfig` buyer fee + reference seller commission tiers from
     `docs/FEES.md`), payout policy, dispute process, tone (friendly, concise, emoji-free).
     Hardcode the policy facts directly; do not DB-query from the prompt file.
   - **Escalation detection**: after every AI response, check if the text contains any of:
     `"I don't know"`, `"I'm not sure"`, `"I cannot help"`, `"I'm unable"`, or the user's latest
     message matches `/\b(human|agent|real person|talk to (a )?person|escalate)\b/i`.
     If triggered, call `createSupportTicket(userId, messages)` (see task 6) and append a short
     escalation notice to the streamed response before closing it.
   - **Streaming**: use `TransformStream` + `Response` with `Content-Type: text/event-stream` so
     the client receives SSE deltas. On any upstream Anthropic error, flush a final
     `data: {"error":"AI temporarily unavailable. Please try again."}\n\n` and close.
   - If `ANTHROPIC_API_KEY` is absent: return 503 `{ error: "Support unavailable" }`.

3. **Support widget** (`src/components/chat/SupportWidget.tsx`):
   - Client component (`"use client"`), rendered once in the root layout
     (`src/app/(dashboard)/layout.tsx` AND `src/app/(shop)/layout.tsx` — support is available on
     both buyer-facing and seller-facing pages).
   - **Floating button**: fixed bottom-right (`bottom-6 right-6`), blue circle with a chat icon,
     z-50. Hidden entirely when `NEXT_PUBLIC_SUPPORT_ENABLED !== "true"` (set this env var to gate
     without touching code; widget is also hidden if the API returns 503 on first message).
   - **Drawer**: slides up from bottom on mobile (full-width, 400 px tall); on desktop anchors
     as a 380 × 520 px panel above the button. Use Tailwind transitions, no extra animation lib.
   - **A11y**: `role="dialog"`, `aria-label="GETX Support Chat"`, `aria-live="polite"` on the
     message list, trap focus when open, close on Escape, visible focus rings.
   - **Message state**: `useState<{role,content,id}[]>` — max 20 turns enforced client-side;
     when the 20-turn limit is reached, show a soft reset banner ("Chat history full — start a
     new conversation?") and clear on user confirmation.
   - **Streaming rendering**: consume the SSE stream with `fetch` + `ReadableStreamDefaultReader`;
     append delta characters to the last assistant message as they arrive.
   - **Typing indicator**: show three animated dots while a request is in-flight (Tailwind keyframe
     `animate-bounce` staggered on three spans).
   - **Input**: textarea, max 500 chars (counter shown), disabled during streaming, sends on Enter
     (Shift+Enter = newline), explicit Send button.
   - **Escalation UX**: when the server signals escalation (include `"escalated":true` in final SSE
     event), show a green banner: "Your query has been escalated — a team member will follow up."

4. **System prompt file** (`src/lib/support-prompt.ts`):
   - Export `buildSystemPrompt(context?: string): string`.
   - Sections: identity, scope (orders/escrow/fees/disputes/listings/payouts — NOT general
     programming help), escrow states with transition rules, fees (buyer 5 % platform fee, seller
     commission tiers from `siteConfig` or a literal table if `siteConfig` doesn't export tiers),
     dispute SLA (admin resolves within 48 h), payout timeline (T+2 business days), escalation
     instruction ("If you cannot answer confidently or the user asks for a human, include the
     exact phrase 'I don't know' in your reply."). Append `context` block if non-empty.

5. **Support service** (`src/server/services/support.ts`):
   - `getSupportContext(userId: string): Promise<string>` — queries last 5 orders with listing
     title via Prisma `include`, and open disputes; returns compact plain-text string. Returns `""`
     on error (never throws — support must not break the page).
   - `createSupportTicket(userId: string | null, messages: Message[], subject?: string): Promise<SupportTicket>` —
     inserts a `SupportTicket` row, serialises `messages` to `chatHistory` JSON, subject defaults to
     first user message truncated to 80 chars, status defaults to `OPEN`. Idempotent if the same
     `userId` + same `subject` already has an `OPEN` ticket (return the existing one).

6. **SupportTicket model** (new Prisma model):
   - Fields: `id String @id @default(cuid())`, `userId String?` (nullable — guests),
     `subject String`, `chatHistory Json`, `status SupportTicketStatus` (enum `OPEN | CLOSED`),
     `adminNote String?`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
   - Relation: `user User? @relation(fields:[userId], references:[id], onDelete: SetNull)`.
   - Index: `@@index([status, createdAt])`.
   - **Migration**: use the `prisma migrate diff --from-schema-datasource --to-schema-datamodel`
     → hand-write `prisma/migrations/20260609000000_step16_support_ticket/migration.sql` →
     `prisma migrate deploy`. Do NOT run `prisma migrate dev` (interactive).

7. **Admin support queue** (`src/app/admin/support/page.tsx`):
   - ADMIN-only (redirect non-admin).
   - Table: ticket id, subject (truncated), user email (or "Guest"), status, createdAt.
   - Filter tabs: All | Open | Closed.
   - Click row → `/admin/support/[id]` detail page: full `chatHistory` rendered as a read-only
     chat transcript, admin note textarea, "Close ticket" button (sets status `CLOSED` + saves
     note via Server Action `src/server/actions/support.ts → closeTicket`).
   - Every admin action writes an `AuditLog` entry (`CLOSE_SUPPORT_TICKET`, targetId = ticketId).
   - Add a "Support" link to the existing admin sidebar/nav.

8. **Environment variables**:
   - Add `ANTHROPIC_API_KEY=` to `.env.example` (key only, no value).
   - Add `NEXT_PUBLIC_SUPPORT_ENABLED=true` to `.env.example`.
   - Widget is hidden if `NEXT_PUBLIC_SUPPORT_ENABLED` is not `"true"` — this is the feature flag.

9. **Edge cases**:
   - `ANTHROPIC_API_KEY` absent → `ai.ts` exports `null`; API route returns 503; widget detects 503
     on first call and hides itself (`setVisible(false)`) without showing an error to the user.
   - Streaming error mid-response → flush error event, close stream, widget shows inline error
     toast "AI temporarily unavailable. Please try again." Do not crash the page.
   - Empty message (`"".trim()`) → blocked client-side (Send button disabled) AND server-side
     (Zod `min(1)` on content).
   - Message > 500 chars → truncated server-side after Zod validation; client char counter warns
     at 480 chars.
   - Guest (unauthenticated) user → no context injection; rate limit by IP; escalation creates
     ticket with `userId = null`.
   - Network offline → `fetch` rejects; widget shows "Connection lost. Check your internet."
   - 20-turn limit reached → server rejects messages array > 20 entries (Zod `max(20)`); client
     shows reset banner.
   - Admin closes a ticket that is already `CLOSED` → idempotent (no error, no duplicate AuditLog).

10. **QA harness** (`scripts/qa-step16.ts`):
    - Run with `npx tsx scripts/qa-step16.ts` against the live dev server.
    - Test cases (use `ok(label, condition)` / `threw(label, fn)` helpers from earlier QA scripts):
      a. **Mock Anthropic absent**: temporarily unset `ANTHROPIC_API_KEY`, hit `/api/support/chat`,
         expect 503.
      b. **Input validation**: empty content → 400; content > 500 chars → 400; messages > 20 → 400.
      c. **Rate limit**: send 31 POST requests in loop → 31st must return 429.
      d. **Context injection**: log in as test buyer who has orders; send "where is my order?";
         verify the response mentions order data (check response text contains an order id or status).
      e. **Escalation trigger**: send message `"I want to talk to a human"` → verify a
         `SupportTicket` row was created in the DB and has status `OPEN`.
      f. **Escalation via AI phrase**: mock an Anthropic response that contains "I don't know" →
         verify `createSupportTicket` is called (spy or check DB row count).
      g. **Ticket creation idempotency**: call `createSupportTicket` twice with identical
         userId + subject → only one `OPEN` ticket exists.
      h. **Close ticket Server Action**: call `closeTicket(ticketId, "resolved")` as admin →
         ticket status = `CLOSED`, adminNote set, AuditLog row created.
      i. **Non-admin blocked**: call `closeTicket` as buyer → throws auth error.
      - Clean up: delete any `SupportTicket` rows created with known test user ids in `finally`.

### Rules

- `ANTHROPIC_API_KEY` absent must never crash the app or show an error to the user — widget silently
  hides itself. Env-safe pattern is non-negotiable.
- Rate limit is enforced server-side (never client-side only). 30 msg/hour/user; 429 on breach.
- All escalation ticket writes and admin mutations go through Server Actions with re-checked auth +
  role; every admin mutation writes an `AuditLog`.
- No AI inference logic in React components — all Claude calls are in the API route and service layer.

### Report back

CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST

- [ ] Widget appears on shop + dashboard pages; opens/closes correctly; close on Escape works
- [ ] Floating button is hidden when `NEXT_PUBLIC_SUPPORT_ENABLED !== "true"`
- [ ] Streaming renders character-by-character; typing indicator shows during in-flight request
- [ ] Input blocked when empty; char counter warns at 480; send blocked during streaming
- [ ] 20-turn limit shows reset banner; server rejects >20 messages with 400
- [ ] Context injection: logged-in buyer asking "where is my order?" gets a response referencing actual order data
- [ ] Rate limit: 31st message in an hour returns 429 with correct error message
- [ ] Escalation via user phrase ("talk to a human") → `SupportTicket` created with status OPEN
- [ ] Escalation via AI phrase ("I don't know") → `SupportTicket` created with status OPEN
- [ ] Escalation UX banner appears in widget after escalation
- [ ] `ANTHROPIC_API_KEY` absent → API route returns 503; widget hides itself (no visible error)
- [ ] Streaming error mid-response → widget shows inline error toast; page does not crash
- [ ] Guest (unauthenticated) user can use the widget; ticket created with `userId = null`
- [ ] Admin `/admin/support` shows open tickets, filter tabs work, row click opens detail
- [ ] Admin can close ticket + add note; status updates to CLOSED; AuditLog row written
- [ ] Non-admin accessing `/admin/support` is redirected
- [ ] `SupportTicket` migration applied cleanly; model visible in Prisma Studio
- [ ] `qa-step16.ts` passes all test cases (mock Anthropic, rate limit, escalation, context, ticket CRUD)
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive (widget full-width on mobile)
- [ ] Step 16 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step

Step 17 — **Live Trust Score**: real-time seller trust score recomputed on key events (order
completed, dispute opened/resolved, review submitted) via Vercel Cron + background job, displayed
on listing cards and seller profiles.

## 🔑 Tokens needed: **`ANTHROPIC_API_KEY`**
