# GETX Socket.io Server (Step 11)

The **real-time chat relay** for GETX. It runs as a **standalone Node service on
Railway**, separate from the Next.js app on Vercel — Vercel is serverless and
cannot hold persistent websocket connections, so realtime lives here.

This server is deliberately **thin**:

- it **authenticates** every socket (short-lived JWT minted by the GETX app),
- manages **one room per conversation**,
- **relays** events (`message:send` → `message:new`, `typing`, `read`),
- and **persists** by calling the GETX app's secured internal API.

It holds **no business logic and no database access** — all rules + Prisma live
in the Next app. See `src/server.ts` for the relay and `src/app-client.ts` for
the internal-API calls.

```
Browser ──ws──► socket-server (Railway) ──https (Bearer INTERNAL_API_SECRET)──► GETX app (Vercel) ──► Neon DB
   ▲                                                                                  │
   └──────────── POST /api/socket-token (mints the 5-min handshake JWT) ◄─────────────┘
```

## Events

| Event (client → server) | Purpose | Server → room |
|---|---|---|
| `conversation:join {conversationId}` | join a room (membership checked) | — (ack) |
| `message:send {conversationId, body, clientId}` | send a message | `message:new` |
| `typing {conversationId, isTyping}` | typing indicator | `typing` |
| `message:read {conversationId}` | mark read | `read` |

Every payload is validated at runtime; sends require the socket to have joined
(⇒ been authorized for) the room, and the app re-checks membership on persist.

## Environment

Copy `.env.example` → `.env` and fill it in. The two secrets **must match** the
GETX Next app's `.env`:

| Var | Meaning |
|---|---|
| `PORT` | listen port (Railway injects its own in prod) |
| `ALLOWED_ORIGIN` | storefront origin allowed by CORS (e.g. `https://getx.live`) |
| `APP_URL` | base URL of the GETX app (its internal API) |
| `SOCKET_AUTH_SECRET` | verifies the handshake JWT — **same value** as the app |
| `INTERNAL_API_SECRET` | Bearer token for the app's internal API — **same value** as the app |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Run locally (both apps)

Two terminals:

**1. Socket server** (this folder):
```bash
cd socket-server
cp .env.example .env          # set SOCKET_AUTH_SECRET + INTERNAL_API_SECRET
npm install
npm run dev                   # → http://localhost:4000  (GET /health = 200)
```

**2. GETX app** (repo root) — in its `.env` set, matching the above:
```
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
SOCKET_AUTH_SECRET=<same as socket-server>
INTERNAL_API_SECRET=<same as socket-server>
```
```bash
npm run dev                   # → http://localhost:3000
```

Then log in as a **buyer** in one browser and a **seller** in another (or a
normal + incognito window), open a listing/order → **Chat**, and message live.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | watch-mode dev server (tsx) |
| `npm run build` | compile `src/` → `dist/` (tsc) |
| `npm start` | run the built server (`node dist/index.js`) |
| `npm run typecheck` | type-check `src/` + `test/` |
| `npm run qa` | relay test (boots the server with stub deps, drives two clients) |

## Deploy to Railway

1. **New service** in your Railway project, connected to this repo.
2. **Root directory:** `socket-server`.
3. **Build command:** `npm install && npm run build` · **Start command:** `npm start`.
4. **Variables** (Railway → service → Variables):
   - `ALLOWED_ORIGIN=https://getx.live` (your storefront origin)
   - `APP_URL=https://<your-vercel-app>` (the GETX app)
   - `SOCKET_AUTH_SECRET=<same value you set in Vercel>`
   - `INTERNAL_API_SECRET=<same value you set in Vercel>`
   - (`PORT` is provided by Railway — don't hardcode it.)
5. **In Vercel** (GETX app env), set:
   - `NEXT_PUBLIC_SOCKET_URL=https://<your-railway-service-url>`
   - `SOCKET_AUTH_SECRET` + `INTERNAL_API_SECRET` (the same two values)
6. **Verify:** open `https://<railway-service-url>/health` → `{ "ok": true }`.

> When the full nonce-based CSP lands (Step 32), add the Railway socket origin to
> the app's `connect-src` directive so the browser may open the websocket.
