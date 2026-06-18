import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { authLog } from "@/lib/auth-log";

/**
 * Cookie-clearing sign-out endpoint (GET).
 *
 * Why this exists: a stale/revoked JWT (user banned, deleted, role-changed, or
 * password reset on another device) still DECODES, so the optimistic proxy
 * treats it as logged-in, while the server-side `requireUser()` rejects it. If
 * the rejection only `redirect('/login')`-ed, the proxy would bounce the still-
 * present cookie straight back to /dashboard → an infinite ERR_TOO_MANY_REDIRECTS
 * loop. A Server Component render CANNOT clear a cookie (its Set-Cookie is
 * discarded), but a Route Handler CAN — `signOut()` here writes the expiring
 * Set-Cookie onto this response, so the browser actually drops the session
 * before we land on /login.
 *
 * `requireUser()`/`requireRole()` send users here (instead of /login) whenever a
 * session cookie is present but no valid session resolves.
 */
export async function GET() {
  await signOut({ redirect: false });
  authLog("logout.success", { reason: "stale-or-revoked-session" });
  redirect("/login?signedout=1");
}
