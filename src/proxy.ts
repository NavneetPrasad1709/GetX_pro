import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Route protection at the edge of the app (Next.js 16 "proxy" = the old
 * middleware). This layer is OPTIMISTIC — it only decodes the session cookie
 * for fast redirects. Real enforcement always happens again server-side via
 * requireUser()/requireRole() in layouts, pages and server actions.
 */

const GUEST_ONLY = ["/login", "/register", "/forgot-password", "/reset-password"];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const secret = process.env.AUTH_SECRET;
  // Misconfigured env → fall through; server-side guards still protect pages.
  if (!secret) return NextResponse.next();

  const token = await getToken({
    req,
    secret,
    secureCookie: req.nextUrl.protocol === "https:",
  });
  const isLoggedIn = !!token;

  const needsAuth =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/become-seller") ||
    pathname.startsWith("/seller") ||
    pathname.startsWith("/admin");

  // Not logged in → send to login, remember where they were going.
  if (!isLoggedIn && needsAuth) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(login);
  }

  // Admin area requires the ADMIN role.
  if (isLoggedIn && pathname.startsWith("/admin") && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  // Logged-in users don't need login/register pages.
  if (
    isLoggedIn &&
    GUEST_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: [
    "/dashboard/:path*",
    "/become-seller",
    "/seller/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ],
};
