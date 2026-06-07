import NextAuth, { type NextAuthConfig, type Session } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Discord, { type DiscordProfile } from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { credentialsSchema } from "@/lib/validators/auth";

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

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      // Rate limit HERE too (not only in loginAction): NextAuth also exposes
      // POST /api/auth/callback/credentials, which would otherwise bypass the
      // action-level limiter + Turnstile. Defense in depth.
      const ip =
        request.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      const rl = rateLimit(`authorize:${ip}`, {
        limit: 10,
        windowMs: 60_000,
      });
      if (!rl.ok) return null; // surfaces as a generic login failure

      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const email = parsed.data.email.toLowerCase();
      const user = await db.user.findUnique({ where: { email } });

      const passwordOk = await bcrypt.compare(
        parsed.data.password,
        user?.passwordHash ?? getDummyHash(),
      );
      // Generic failure — never reveal whether the email or the password was wrong.
      if (!user?.passwordHash || !passwordOk) return null;

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
      if (account?.provider === "google") {
        return profile?.email_verified === true;
      }
      if (account?.provider === "discord") {
        return (profile as DiscordProfile | undefined)?.verified === true;
      }
      return true; // credentials are fully checked in authorize()
    },
    async jwt({ token, user, trigger }) {
      // Initial sign-in: copy our domain fields onto the token.
      if (user?.id) {
        token.id = user.id;
        token.role = user.role;
        token.emailVerified = user.emailVerified?.toISOString() ?? null;
      }
      // Session refresh requested (e.g. after "become a seller" or email
      // verification) → re-read fresh values from the DB.
      if (trigger === "update" && token.id) {
        const fresh = await db.user.findUnique({
          where: { id: token.id },
          select: { role: true, emailVerified: true, name: true, image: true },
        });
        if (fresh) {
          token.role = fresh.role;
          token.emailVerified = fresh.emailVerified?.toISOString() ?? null;
          token.name = fresh.name;
          token.picture = fresh.image;
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

/** Returns the session or redirects to /login. Use in pages/layouts/actions. */
export async function requireUser(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
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
