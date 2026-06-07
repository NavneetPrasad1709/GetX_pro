# STEP 11 — Real-time Chat (Socket.io on Railway)

> Goal: Buyer ↔ seller messaging. A thin Socket.io server on Railway relays messages; persistence
> via our DB. Vercel can't host websockets — that's why this is a separate server. Guardrail §7 (auth).

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior DevOps Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md`. Work in `D:\GetX`. This is **Step 11 — Real-time chat**.
Talk Hinglish. Follow the full workflow.

### Task
1. **Socket.io server** in `socket-server/` (standalone Node + TypeScript):
   - On connect, **authenticate** the user (verify the Auth.js session token / a short-lived JWT
     issued by the Next app). Reject unauthenticated sockets.
   - Rooms per `conversationId`. Events: `message:send`, `message:new`, `typing`, `read`.
   - Persist messages by calling a secured Next API endpoint (server-to-server secret) OR the shared
     Prisma client — keep the socket server **thin** (relay + persist), no business logic.
   - Health check route for Railway. CORS limited to our storefront origin.
2. **Conversations/messages** (DB from Step 02): create/find conversation between buyer & seller
   (optionally tied to an order). API to list conversations + message history (paginated).
3. **Storefront chat UI**: chat list (`(dashboard)/messages`) + conversation view; "Chat with seller"
   button on listing/order opens/creates a conversation. Real-time updates via Socket.io client;
   optimistic send; unread badges; auto-scroll; loading/empty states.
4. **Config**: `SOCKET_SERVER_URL` env on storefront; `.env` for socket server (DB url, allowed origin,
   auth secret). Document how to run both locally (storefront + socket server) and how to deploy the
   socket server to **Railway** (separate service).
5. **Edge cases**: reconnect on drop, message ordering, blocked/invalid users, very long messages,
   spam rate-limit per socket.

### Rules
- Authenticate every socket. Validate sender owns the conversation. Rate-limit sends.
- Keep socket server thin; persistence + rules through the app. No secrets in client.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Two browsers (buyer + seller) chat in real time; messages persist + reload correctly
- [ ] Unauthenticated socket rejected; user can't join a conversation they're not part of
- [ ] Reconnect works; message order correct; unread badges update
- [ ] Rate limiting stops spam; long/empty messages handled
- [ ] Local run instructions for both apps documented; Railway deploy steps documented
- [ ] `typecheck`/`lint`/`build` pass (both app + socket server); mobile responsive chat
- [ ] Step 11 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Chat between a buyer and seller account. Tell me **"Step 11 done"** → Step 12 (Image upload / R2).

## 🔑 Tokens needed for THIS step
**None for local.** For deploy: a **Railway** service for the socket server (token at deploy step).
