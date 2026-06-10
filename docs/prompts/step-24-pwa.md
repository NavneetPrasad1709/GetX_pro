# STEP 24 — Mobile-first PWA (Installable + Offline)

> Goal: Make GETX a fully installable Progressive Web App on Android and iOS — offline fallback,
> standalone app-like feel, A2HS install prompt, and a Lighthouse PWA score ≥ 90.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Frontend + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§7). Work in `D:\GetX`. This is **Step 24 — Mobile-first PWA**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Service Worker setup** (`public/sw.js` + `next.config.ts` registration):

   - Use the **built-in Next.js service worker approach** via `public/sw.js` (plain Workbox via
     `importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js')`)
     rather than the `next-pwa` wrapper package — `next-pwa` has known compatibility issues with
     Next.js 16 App Router / Turbopack. If at runtime `next-pwa` (v5.6+) is already in
     `package.json` and works cleanly, use it; otherwise fall back to a hand-written `public/sw.js`.
   - In `next.config.ts`, add a custom `headers()` entry to serve `sw.js` with
     `Service-Worker-Allowed: /` and `Cache-Control: no-cache, no-store` so browsers always fetch
     the latest SW without stale-caching it.
   - Register the SW in a `src/components/pwa/sw-register.tsx` Client Component:
     ```ts
     // Registers /sw.js with scope '/' on mount, only in production (process.env.NODE_ENV === 'production')
     // and only when 'serviceWorker' in navigator. Log success/error to console in dev.
     ```
     Import and render `<SwRegister />` at the bottom of the root layout
     (`src/app/layout.tsx`), after all body content, so it never blocks FCP.

2. **Caching strategy** (implement inside `public/sw.js` using Workbox primitives):

   - **Static assets** (JS bundles, CSS, web fonts from `/_next/static/`, `/fonts/`):
     `CacheFirst` strategy, `cacheName: 'static-v1'`, `maxAgeSeconds: 30 * 24 * 60 * 60` (30 days),
     `maxEntries: 150`. Precache the offline page itself.
   - **API routes** (`/api/**`):
     `NetworkFirst` strategy, `networkTimeoutSeconds: 5`, `cacheName: 'api-v1'`,
     `maxAgeSeconds: 60` (1 min stale), `maxEntries: 50`. On network failure use stale cache.
   - **Images** (`.png`, `.jpg`, `.webp`, `.svg`, `/uploads/`, Cloudflare R2 CDN origin):
     `StaleWhileRevalidate` strategy, `cacheName: 'images-v1'`, `maxAgeSeconds: 7 * 24 * 60 * 60`
     (7 days), `maxEntries: 100`.
   - **Navigation requests** (HTML pages — `request.mode === 'navigate'`):
     `NetworkFirst` strategy, `networkTimeoutSeconds: 5`. On failure serve the cached offline page:
     `caches.match('/offline')`. Install-time precache `/offline` so it is always available.
   - Implement a `self.addEventListener('install', ...)` that precaches `['/offline', '/']` and
     calls `self.skipWaiting()`. Add `self.addEventListener('activate', ...)` with
     `clients.claim()` and prune old caches.

3. **Web App Manifest** (`public/manifest.json`):

   ```json
   {
     "name": "GETX — Gaming Marketplace",
     "short_name": "GETX",
     "description": "Buy and sell game accounts, items, and currency — fast, secure, AI-powered.",
     "start_url": "/",
     "scope": "/",
     "display": "standalone",
     "orientation": "portrait-primary",
     "background_color": "#0a0b0d",
     "theme_color": "#4d7cfe",
     "categories": ["games", "shopping"],
     "lang": "en",
     "icons": [
       { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
       { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
     ],
     "screenshots": [
       { "src": "/screenshots/home-mobile.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" },
       { "src": "/screenshots/listing-mobile.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" }
     ],
     "shortcuts": [
       { "name": "Browse Listings", "url": "/listings", "icons": [{ "src": "/icons/icon-96x96.png", "sizes": "96x96" }] },
       { "name": "My Orders", "url": "/orders", "icons": [{ "src": "/icons/icon-96x96.png", "sizes": "96x96" }] }
     ]
   }
   ```

   - **Icon generation** (`scripts/generate-icons.ts`): Use the `sharp` package (add to
     `devDependencies`) to read `public/getx-logo.png` (or `.svg`) and produce:
     - `public/icons/icon-96x96.png`
     - `public/icons/icon-192x192.png`
     - `public/icons/icon-512x512.png`
     - `public/icons/apple-touch-icon.png` (180×180)
     Run via `npx tsx scripts/generate-icons.ts` once; commit the output. If the source logo
     does not exist yet, create a simple placeholder SVG (`public/getx-logo.svg`) with the GETX
     wordmark on a `#4d7cfe` background so the script can proceed.
   - **Screenshots**: Capture or create two 390×844 PNG placeholders at
     `public/screenshots/home-mobile.png` and `public/screenshots/listing-mobile.png`. These
     improve the install dialog on Android Chrome — use Sharp to generate branded placeholder
     screenshots if real captures are not available yet.

4. **Root layout meta tags** (`src/app/layout.tsx`):

   Add inside `<head>` (via Next.js `metadata` export or direct `<head>` JSX — prefer the
   `metadata` export for static values; add `<link>` and `<meta>` tags via the `other` field or
   a `<head>` block for tags Next.js metadata API does not cover natively):

   ```html
   <link rel="manifest" href="/manifest.json" />
   <meta name="theme-color" content="#4d7cfe" />
   <!-- iOS / Safari PWA -->
   <meta name="apple-mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
   <meta name="apple-mobile-web-app-title" content="GETX" />
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
   <!-- Windows / Microsoft -->
   <meta name="msapplication-TileColor" content="#4d7cfe" />
   <meta name="msapplication-TileImage" content="/icons/icon-192x192.png" />
   ```

   Confirm the existing `<meta name="viewport" content="width=device-width, initial-scale=1" />`
   is present (add if missing).

5. **Offline fallback page** (`src/app/offline/page.tsx`):

   A full-page Server Component rendered at route `/offline`. Design requirements (v10 dark + blue):
   - Dark background (`#0a0b0d`), centered card.
   - GETX logo (`/icons/icon-192x192.png` or the SVG).
   - Heading: "You're Offline" (Poppins, large, white).
   - Subtext: "No internet connection. Your recent listings and orders are cached — check back when
     you're connected." (Inter, muted grey).
   - Primary button: "Try Again" — `onClick={() => window.location.reload()}` wrapped in a tiny
     `'use client'` sub-component `src/components/pwa/retry-button.tsx`.
   - Secondary link: "← Go Home" → `/` (works even offline if home is cached).
   - Fully responsive, accessible (aria-labels), no external font requests (rely on already-cached
     fonts from the SW).
   - Do NOT import any component that triggers data fetching (no auth checks, no DB calls) — this
     page must render purely from cache.

6. **Install prompt banner** (`src/components/pwa/install-banner.tsx`):

   A `'use client'` component that:
   - Listens for the `beforeinstallprompt` event (Chrome / Android). Saves the deferred prompt
     with `e.preventDefault()`.
   - Shows a fixed bottom banner only when:
     1. The deferred prompt is available (Android Chrome).
     2. `localStorage.getItem('pwa-install-dismissed')` is falsy (user hasn't dismissed).
     3. The app is not already running in standalone mode
        (`window.matchMedia('(display-mode: standalone)').matches === false`).
   - Banner design (v10): dark surface (`bg-surface-2` or equivalent `#1a1b1f`), blue accent border
     on top, left side: GETX icon (32×32) + "Install GETX for the best experience", right side:
     two buttons — "Install" (primary blue, calls `prompt()`) and "✕" (ghost, sets
     `localStorage.setItem('pwa-install-dismissed', '1')` and hides).
   - On iOS (Safari) where `beforeinstallprompt` never fires: detect
     `navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')` AND not
     standalone; show a static info chip: "Add to Home Screen via Safari's Share menu". Dismiss
     with the same `localStorage` key.
   - On desktop or when already installed: render `null` — no banner.
   - Animate in from the bottom with a 300ms ease-out transition.
   - Import `<InstallBanner />` in the root layout (rendered client-side, after main content).

7. **Push notifications — DEFERRED to Phase 3**:

   Web Push requires VAPID key pair generation (`web-push` package), a `PushSubscription`
   database model, a `/api/push/subscribe` endpoint, and a background worker to call the Push API.
   This is intentionally deferred — note it in `docs/DECISIONS.md` as a follow-up item:
   "Step 24: Web Push notifications deferred to Phase 3. VAPID keys, subscription storage, and
   push dispatch backend needed. Candidates: Resend Web Push (when available) or a lightweight
   web-push worker on Railway."

8. **QA harness** (`scripts/qa-step24.ts`):

   Follow the repo convention (`npx tsx scripts/qa-step24.ts`, `ok()`/`threw()` helpers,
   test data cleaned up in `finally`). Tests must be runnable against the dev build. Cover:

   a. **Manifest validation**: fetch `http://localhost:3000/manifest.json`, parse as JSON, assert
      required fields (`name`, `short_name`, `start_url`, `display`, `background_color`,
      `theme_color`, `icons`); assert `icons` contains entries for `192x192` and `512x512`;
      assert `theme_color === '#4d7cfe'` and `background_color === '#0a0b0d'`.

   b. **Icon files exist**: use `fs.existsSync` to confirm `public/icons/icon-192x192.png`,
      `public/icons/icon-512x512.png`, and `public/icons/apple-touch-icon.png` are present and
      non-empty (file size > 0).

   c. **SW file exists and is valid JS**: assert `public/sw.js` exists; read the file and assert
      it contains the strings `'install'`, `'activate'`, `'fetch'` (the three required SW event
      listeners), and `'workbox'` (confirming Workbox is loaded).

   d. **Offline route renders**: fetch `http://localhost:3000/offline` (GET), assert HTTP 200
      and that the response body contains "You're Offline" (or "offline" case-insensitive) and
      the GETX brand.

   e. **SW registration snippet present**: read `src/components/pwa/sw-register.tsx` and assert
      it contains `navigator.serviceWorker.register` and `'/sw.js'`.

   f. **Meta tags in layout**: read `src/app/layout.tsx` and assert presence of
      `rel="manifest"`, `theme-color`, `apple-mobile-web-app-capable`, and `apple-touch-icon`.

   g. **Install banner component exists**: assert `src/components/pwa/install-banner.tsx` exists;
      read it and assert it contains `beforeinstallprompt` and `pwa-install-dismissed`.

   h. **Build output contains SW**: after a `next build` (or check the `.next/` directory if
      already built), assert that `public/sw.js` has not been accidentally deleted or overridden
      by Next.js's default asset pipeline.

   End the script with a summary line: `console.log('QA Step 24: X/X checks passed')`.

9. **Edge cases**:

   - **SW update flow**: When a new SW is deployed (file hash changes), the old SW must not block
     activation. `skipWaiting()` in `install` + `clients.claim()` in `activate` ensures immediate
     takeover. Test: modify `sw.js` comment, reload page twice — old cache should be pruned.
   - **Cache quota exceeded**: Workbox's `maxEntries` + `maxAgeSeconds` on all strategies prevent
     unbounded growth. On low-storage devices, cache writes fail silently — the SW gracefully falls
     back to network (never crashes the page).
   - **CSP headers conflict**: If the project has a `Content-Security-Policy` header (e.g., in
     `next.config.ts` or `vercel.json`), ensure `script-src` allows `storage.googleapis.com`
     (Workbox CDN) OR switch to a locally bundled `workbox-sw.js` served from `public/`. Document
     the choice in `docs/DECISIONS.md`.
   - **SW scope + next.js routing conflict**: The SW must NOT intercept `/_next/webpack-hmr` or
     `/_next/static/webpack/` routes in development (HMR breaks). Guard: register SW only when
     `process.env.NODE_ENV === 'production'` in `sw-register.tsx`.
   - **iOS standalone detection**: `window.navigator.standalone` (Safari proprietary) differs from
     `matchMedia('(display-mode: standalone)')`. The install banner must check both to avoid showing
     on already-installed iOS apps.
   - **`/offline` page has no layout shell that requires auth**: If the root layout or a parent
     layout checks the session and redirects unauthenticated users, the offline page must be
     excluded from that check — verify `src/app/(dashboard)/` layout does NOT wrap `/offline`.
   - **Screenshots placeholders**: If real screenshots are not captured, generate 390×844 PNG
     placeholders using Sharp with a branded background; mark them as TODO in `docs/DECISIONS.md`.
   - **Lighthouse CI in CI/CD**: Document that running `lighthouse-ci` (lhci) on Vercel preview
     URLs is the Phase 3 follow-up; for now, manual Lighthouse run in Chrome DevTools ≥ 90 is
     the acceptance criterion.

### Rules
- The SW is only registered in **production** (`process.env.NODE_ENV === 'production'`). In dev,
  `sw-register.tsx` must be a no-op so HMR and Next.js fast refresh are never disrupted.
- No PWA code may block the critical rendering path. `<SwRegister />` and `<InstallBanner />` are
  both rendered after body content and use `useEffect` internally so they never delay FCP/LCP.
- All icon, screenshot, and SW assets must be committed to the repo (`public/`). Never rely on
  runtime generation for assets the browser needs during install — they must be statically served.
- The offline page must render with zero network requests and zero DB/auth calls so it works
  purely from the SW cache. Any server component on that route that triggers a DB query or
  session check will break the offline experience.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] `public/manifest.json` validates: `name`, `short_name`, `start_url`, `display standalone`, `background_color #0a0b0d`, `theme_color #4d7cfe`, icons 192+512 both present
- [ ] Icon files exist and are non-empty: `icon-192x192.png`, `icon-512x512.png`, `apple-touch-icon.png` (180×180)
- [ ] `public/sw.js` present; contains `install`, `activate`, `fetch` listeners and Workbox; served with `Cache-Control: no-cache`
- [ ] SW registers successfully in production build — confirmed in Chrome DevTools → Application → Service Workers (status: activated and running)
- [ ] Caching strategies in place: static CacheFirst, API NetworkFirst 5s, images StaleWhileRevalidate, navigation NetworkFirst → /offline fallback
- [ ] Offline fallback works: block network in DevTools → navigate to any page → `/offline` renders with GETX logo + "You're Offline" + "Try Again" button
- [ ] `/offline` route returns HTTP 200, contains brand copy, makes zero DB/auth calls, renders without network
- [ ] Root layout has: `<link rel="manifest">`, `theme-color #4d7cfe`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title GETX`, `apple-touch-icon`
- [ ] Install banner appears on mobile Chrome (Android UA) when `beforeinstallprompt` fires and not yet installed
- [ ] Dismiss button sets `localStorage pwa-install-dismissed`; banner does not reappear on reload
- [ ] "Install" button on banner triggers the native browser install dialog (`prompt()` called)
- [ ] iOS static share-menu tip shown on iPhone/iPad UA (not standalone); hidden on desktop
- [ ] Install banner renders `null` when already in standalone mode (`display-mode: standalone`)
- [ ] `<SwRegister />` is a no-op in dev (no SW registration, no console errors in `npm run dev`)
- [ ] `scripts/qa-step24.ts` passes all checks (`npx tsx scripts/qa-step24.ts` — all X/X passed)
- [ ] Lighthouse PWA audit score ≥ 90 (manual run in Chrome DevTools on production/preview URL)
- [ ] Push notifications follow-up logged in `docs/DECISIONS.md`
- [ ] CSP / Workbox CDN conflict resolved and documented (if applicable)
- [ ] `typecheck`/`lint`/`build` pass; offline page and install banner mobile responsive
- [ ] Step 24 ticked in `docs/ROADMAP.md`; key choices logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Move to **Step 25 — AI Dispute Judge** (Phase 3): Claude `claude-opus-4-8` analyses order
history, chat transcripts, delivery proof, and trust scores to produce a recommended resolution
(release or refund) with a confidence score and reasoning, presented to admin for one-click
approval.

## 🔑 Tokens needed: **None**
