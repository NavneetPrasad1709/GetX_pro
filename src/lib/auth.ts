import NextAuth, { type NextAuthConfig, type Session } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Discord, { type DiscordProfile } from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { rateLimitDistributed } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/config/webhooks";
import { credentialsSchema } from "@/lib/validators/auth";
import { authLog } from "@/lib/auth-log";

/**
 * Auth.js (NextAuth v5) setup — see docs/ENGINEERING-GUARDRAILS.md §7.
 *
 * Session strategy is JWT because the Credentials provider does not create DB
 * sessions (Auth.js limitation). Cookies use the v5 secure defaults:
 * httpOnly, sameSite=lax, `__Secure-` prefix + Secure flag on HTTPS.
 */

/**
 * When the email doesn't exist we still run bcrypt.compare against this dummy
 * hash so login timing stays constant — otherwise attackers could probe which
 * emails are registered by measuring response time.
 */
let dummyHash: string | null = null;
function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync(randomBytes(16).toString("hex"), 12);
  return dummyHash;
}

/**
 * How often a live session re-checks its sessionVersion against the DB (Step
 * 32). Bounds DB load to ≤1 query/min per active session while keeping
 * revocation latency (ban / role change / password reset) under a minute.
 */
const SESSION_REVOCATION_CHECK_MS = 60_000;

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      // Rate limit HERE too (not only in loginAction): NextAuth also exposes
      // POST /api/auth/callback/credentials, which would otherwise bypass the
      // action-level limiter + Turnstile. Defense in depth. Use the SAME trusted
      // client-IP order as the rest of the app (cf-connecting-ip first) so the
      // key can't be rotated via a spoofed leftmost x-forwarded-for.
      const ip = request.headers
        ? clientIpFromHeaders(request.headers)
        : "unknown";

      // Parse FIRST so the per-account window can key on the email. Mirrors
      // loginAction's two-window model (per-IP burst + per-IP+account targeted)
      // and shares the SAME `login:` key prefix, so the direct callback path and
      // the UI action draw from one budget instead of two independent allowances.
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) {
        authLog("login.fail", { ip, reason: "invalid-input" });
        return null;
      }
      const email = parsed.data.email.toLowerCase();

      const [perIp, perAccount] = await Promise.all([
        rateLimitDistributed(`login:${ip}`, { limit: 10, windowMs: 60_000 }),
        rateLimitDistributed(`login:${ip}:${email}`, {
          limit: 5,
          windowMs: 5 * 60_000,
        }),
      ]);
      if (!perIp.ok || !perAccount.ok) {
        authLog("login.fail", { ip, email, reason: "rate-limited" });
        return null; // surfaces as a generic login failure
      }

      const user = await db.user.findUnique({ where: { email } });

      const passwordOk = await bcrypt.compare(
        parsed.data.password,
        user?.passwordHash ?? getDummyHash(),
      );
      // Generic failure — never reveal whether the email or the password was wrong.
      if (!user?.passwordHash || !passwordOk) {
        authLog("login.fail", { ip, email, reason: "bad-credentials" });
        return null;
      }
      // Banned users can never sign in (Step 15). Generic failure — no hint why.
      if (user.bannedAt) {
        authLog("login.fail", { ip, email, userId: user.id, reason: "banned" });
        return null;
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        emailVerified: user.emailVerified,
      };
    },
  }),
];

// OAuth providers are wired but stay OFF until their creds are set in .env.
// allowDangerousEmailAccountLinking is safe ONLY because the signIn callback
// below rejects provider emails that the provider itself hasn't verified —
// so an attacker can't squat someone's email to hijack their GETX account.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      // Explicit — our env names differ from Auth.js' AUTH_GOOGLE_ID convention
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          // Google has already verified this email (enforced in signIn below)
          emailVerified: profile.email_verified ? new Date() : null,
          role: "BUYER" as Role,
        };
      },
    }),
  );
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  providers.push(
    Discord({
      // Explicit — our env names differ from Auth.js' AUTH_DISCORD_ID convention
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        const image = profile.avatar
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
          : null;
        return {
          id: profile.id,
          name: profile.global_name ?? profile.username,
          email: profile.email,
          image,
          // Discord-verified email (enforced in signIn below)
          emailVerified: profile.verified ? new Date() : null,
          role: "BUYER" as Role,
        };
      },
    }),
  );
}

export const {
  handlers,
  auth,
  signIn,
  signOut,
  unstable_update: updateSession,
} = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers,
  events: {
    // A successful OAuth link implies a provider-verified email (the signIn
    // callback rejects unverified ones) — so mark the account verified.
    async linkAccount({ user }) {
      if (user.id && !user.emailVerified) {
        await db.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }
    },
  },
  callbacks: {
    // OAuth sign-ins are only accepted from provider-VERIFIED emails. This is
    // what makes allowDangerousEmailAccountLinking safe (no email squatting).
    async signIn({ account, profile }) {
      const provider = account?.provider;
      // Banned users can never sign in via OAuth either (Step 15). Credentials
      // are blocked inside authorize(); this covers the Google/Discord paths.
      const email = profile?.email?.toLowerCase();
      if (email) {
        const existing = await db.user.findUnique({
          where: { email },
          select: { bannedAt: true },
        });
        if (existing?.bannedAt) {
          authLog("oauth.denied", { provider, email, reason: "banned" });
          return false;
        }
      }
      if (provider === "google") {
        const ok = profile?.email_verified === true;
        authLog(ok ? "oauth.callback" : "oauth.denied", {
          provider,
          email,
          reason: ok ? undefined : "email-unverified",
        });
        return ok;
      }
      if (provider === "discord") {
        const ok = (profile as DiscordProfile | undefined)?.verified === true;
        authLog(ok ? "oauth.callback" : "oauth.denied", {
          provider,
          email,
          reason: ok ? undefined : "email-unverified",
        });
        return ok;
      }
      return true; // credentials are fully checked in authorize()
    },
    async jwt({ token, user, trigger, account }) {
      const now = Date.now();

      // Initial sign-in: copy our domain fields onto the token + stamp the
      // current sessionVersion so we can revoke this token later if it's bumped.
      if (user?.id) {
        token.id = user.id;
        token.role = user.role;
        token.emailVerified = user.emailVerified?.toISOString() ?? null;
        const fresh = await db.user.findUnique({
          where: { id: user.id },
          select: { sessionVersion: true },
        });
        token.sessionVersion = fresh?.sessionVersion ?? 0;
        token.svCheckedAt = now;
        // Authoritative "logged in" signal — covers BOTH the credentials action
        // and the direct /api/auth/callback/credentials path, plus OAuth.
        authLog("login.success", {
          userId: user.id,
          email: user.email,
          provider: account?.provider ?? "credentials",
        });
        authLog("session.created", { userId: user.id });
        return token;
      }

      // Explicit refresh (e.g. after "become a seller" or email verification)
      // → re-read fresh values from the DB, including sessionVersion.
      if (trigger === "update" && token.id) {
        const fresh = await db.user.findUnique({
          where: { id: token.id },
          select: {
            role: true,
            emailVerified: true,
            name: true,
            image: true,
            sessionVersion: true,
          },
        });
        if (fresh) {
          token.role = fresh.role;
          token.emailVerified = fresh.emailVerified?.toISOString() ?? null;
          token.name = fresh.name;
          token.picture = fresh.image;
          token.sessionVersion = fresh.sessionVersion;
          token.svCheckedAt = now;
        }
        return token;
      }

      // Periodic revocation check (Step 32): at most once per interval per
      // active session. If sessionVersion was bumped (ban / role change /
      // password reset) the token no longer matches → reject it (sign out).
      if (
        token.id &&
        now - (token.svCheckedAt ?? 0) > SESSION_REVOCATION_CHECK_MS
      ) {
        try {
          const fresh = await db.user.findUnique({
            where: { id: token.id },
            select: { sessionVersion: true },
          });
          if (!fresh || fresh.sessionVersion !== (token.sessionVersion ?? 0)) {
            authLog("session.revoked", {
              userId: token.id,
              reason: fresh ? "version-bumped" : "user-gone",
            });
            return null; // user gone or session revoked → kill it
          }
          token.svCheckedAt = now;
        } catch (err) {
          // Transient DB error → fail OPEN (keep the session) rather than mass
          // logout on a blip; leave svCheckedAt so the next call retries.
          console.error("[auth] sessionVersion check failed", err);
        }
      }

      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.emailVerified = token.emailVerified
        ? new Date(token.emailVerified)
        : null;
      return session;
    },
  },
});

// ---------------------------------------------------------------------------
// Authorization helpers — use on EVERY protected page/layout/server action.
// (a) logged in?  (b) correct role?  (c) owns the resource?
// ---------------------------------------------------------------------------

/**
 * True when a session cookie is physically present. A revoked/expired/deleted
 * session can still leave a (now-invalid) cookie that the optimistic proxy
 * decodes as "logged in". When `auth()` yields no session but a cookie exists,
 * we must route through the cookie-CLEARING /logout route rather than /login —
 * otherwise the proxy bounces the stale cookie back and we loop forever.
 */
async function hasSessionCookie(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(
    jar.get("__Secure-authjs.session-token") ??
      jar.get("authjs.session-token") ??
      // chunked variants for large tokens
      jar.get("__Secure-authjs.session-token.0") ??
      jar.get("authjs.session-token.0"),
  );
}

/** Returns the session or redirects to /login. Use in pages/layouts/actions. */
export async function requireUser(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect((await hasSessionCookie()) ? "/logout" : "/login");
  }
  return session;
}

/**
 * Returns the session only if the user has one of the given roles,
 * otherwise redirects. ADMIN passes nothing implicitly — list it explicitly.
 */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await requireUser();
  if (!roles.includes(session.user.role)) redirect("/dashboard");
  return session;
}

/**
 * Returns the userId of the CURRENT admin only if they are STILL an admin and
 * not banned per the LIVE database — closing the ≤60s JWT staleness window on
 * the highest-stakes surface (admin + money mutations). Use in privileged
 * server actions instead of trusting `session.user.role` from the token.
 */
export async function getActiveAdminId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const fresh = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, bannedAt: true },
  });
  if (!fresh || fresh.role !== "ADMIN" || fresh.bannedAt) return null;
  return session.user.id;
}

/** Thrown by assertOwner — map to a 403/error UI, never expose internals. */
export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Ownership guard: the resource's owning userId must match the session user.
 * ADMIN bypasses (admins moderate everything). Throws ForbiddenError.
 */
export function assertOwner(
  resource: { userId: string | null | undefined },
  user: { id: string; role: Role },
): void {
  if (user.role === "ADMIN") return;
  if (!resource.userId || resource.userId !== user.id) {
    throw new ForbiddenError();
  }
}
