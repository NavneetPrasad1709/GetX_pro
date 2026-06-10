/* GETX service worker (Step 24). Workbox via CDN — no build-time wrapper (next-pwa is incompatible
 * with Next 16 / Turbopack). Registered ONLY in production by src/components/pwa/sw-register.tsx. */
/* global importScripts */
importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js");

const OFFLINE_URL = "/offline";

if (self.workbox) {
  const { core, precaching, routing, strategies, expiration, cacheableResponse } = self.workbox;

  core.setCacheNameDetails({ prefix: "getx" });

  // Precache the offline fallback + home so they're always available offline.
  precaching.precacheAndRoute([
    { url: OFFLINE_URL, revision: "v1" },
    { url: "/", revision: "v1" },
  ]);

  // Static build assets + fonts → CacheFirst (30 days).
  routing.registerRoute(
    ({ url }) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/"),
    new strategies.CacheFirst({
      cacheName: "static-v1",
      plugins: [
        new expiration.ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  );

  // API routes → NetworkFirst (5s timeout, 1-min stale fallback).
  routing.registerRoute(
    ({ url }) => url.pathname.startsWith("/api/"),
    new strategies.NetworkFirst({
      cacheName: "api-v1",
      networkTimeoutSeconds: 5,
      plugins: [
        new expiration.ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 }),
        new cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  );

  // Images (incl. Cloudflare R2 CDN) → StaleWhileRevalidate (7 days).
  routing.registerRoute(
    ({ request, url }) =>
      request.destination === "image" ||
      /\.(?:png|jpg|jpeg|webp|svg|gif)$/.test(url.pathname),
    new strategies.StaleWhileRevalidate({
      cacheName: "images-v1",
      plugins: [
        new expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      ],
    }),
  );

  // Navigations (HTML) → NetworkFirst, falling back to the cached offline page.
  const navHandler = new strategies.NetworkFirst({
    cacheName: "pages-v1",
    networkTimeoutSeconds: 5,
  });
  routing.registerRoute(
    ({ request }) => request.mode === "navigate",
    async (args) => {
      try {
        const res = await navHandler.handle(args);
        return res || (await caches.match(OFFLINE_URL));
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    },
  );
}

// Take control immediately so a new SW version activates without a second reload.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("getx-offline-v1").then((cache) => cache.addAll([OFFLINE_URL, "/"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("getx") && k.endsWith("-old"))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// Explicit fetch listener (required by the PWA spec / QA) — Workbox routing handles the rest.
self.addEventListener("fetch", () => {});
