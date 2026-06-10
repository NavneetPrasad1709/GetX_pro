import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { buildCsp } from "@/lib/csp";

/**
 * Edge proxy (Next.js 16 "proxy" = the old middleware). Two jobs:
 *
 * 1. OPTIMISTIC route protection — decode the session cookie for fast
 *    redirects. Real enforcement always happens again server-side via
 *    requireUser()/requireRole() in layouts, pages and server actions.
 *
 * 2. Content-Security-Policy (Step 32). A strong STATIC policy ships on every
 *    route by default — ISR-safe (no dynamic deopt), and it won't break
 *    Razorpay/Turnstile/PostHog or inline JSON-LD. CSP lives ONLY here (removed
 *    from next.config) so each route emits exactly one CSP header.
 *
 *    NONCE MODE is built + dormant behind CSP_NONCE_ENABLED (same "flip on at
 *    launch" pattern as Upstash/Sentry/Algolia). When enabled, SENSITIVE routes
 *    (auth + the authenticated app — already dynamic, top XSS surface) upgrade
 *    to a per-request nonce + 'strict-dynamic'. Keep it OFF until checkout +
 *    OAuth are runtime-verified with it on (it blocks un-nonced inline scripts,
 *    e.g. the root-layout JSON-LD, on those routes). See docs/DECISIONS.md.
 */

const GUEST_ONLY = ["/login", "/register", "/forgot-password", "/reset-password"];

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/become-seller",
  "/seller",
  "/checkout",
  "/orders",
  "/messages",
  "/admin",
];

const isDev = process.env.NODE_ENV !== "production";
// Nonce mode is opt-in (flip on at launch once checkout/OAuth are verified).
const nonceMode = process.env.CSP_NONCE_ENABLED === "true";

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const needsAuth = (pathname: string) => matchesPrefix(pathname, PROTECTED_PREFIXES);
const isGuestOnly = (pathname: string) => matchesPrefix(pathname, GUEST_ONLY);

/** Sensitive = dynamic + high XSS value → per-request nonce CSP. */
const isSensitive = (pathname: string) => needsAuth(pathname) || isGuestOnly(pathname);

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // --- 1. Auth redirects (optimistic) ---------------------------------------
  const secret = process.env.AUTH_SECRET;
  // Misconfigured env → skip redirects (server-side guards still protect), but
  // still apply the CSP below.
  if (secret) {
    const token = await getToken({
      req,
      secret,
      secureCookie: req.nextUrl.protocol === "https:",
    });
    const isLoggedIn = !!token;

    // Not logged in → send to login, remember where they were going.
    if (!isLoggedIn && needsAuth(pathname)) {
      const login = new URL("/login", req.nextUrl);
      login.searchParams.set("callbackUrl", pathname + search);
      return NextResponse.redirect(login);
    }
    // Admin area requires the ADMIN role.
    if (isLoggedIn && pathname.startsWith("/admin") && token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
    // Logged-in users don't need login/register pages.
    if (isLoggedIn && isGuestOnly(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
  }

  // --- 2. CSP ----------------------------------------------------------------
  if (nonceMode && isSensitive(pathname)) {
    // A fresh, unguessable base64 nonce per request. Next.js reads it from the
    // request CSP header and stamps it onto its own inline bootstrap scripts.
    const nonce = btoa(crypto.randomUUID());
    const csp = buildCsp({ nonce, isDev });
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  // Default everywhere (and all public/ISR routes) → strong no-nonce policy,
  // response header only (no x-nonce → no dynamic deopt → ISR preserved).
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", buildCsp({ isDev }));
  return res;
}

export const proxyConfig = {
  matcher: [
    {
      // Run on document routes only. Exclude /api, all /_next internals, and any
      // path with a file extension (sw.js, manifest.json, sitemap.xml, /icons/*,
      // images served from public/) — those don't need auth checks or a CSP and
      // shouldn't pay for a getToken() per request. Slugs are dot-free, so real
      // pages still match. Skip prefetch requests (no nonce on an unrendered nav).
      source: "/((?!api|_next|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
