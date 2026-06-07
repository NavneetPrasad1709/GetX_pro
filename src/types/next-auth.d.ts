import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Auth.js type augmentation — adds our domain fields (id, role, emailVerified)
 * to the session, user and JWT so every auth() call is fully typed.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** null until the user clicks the verification link */
      emailVerified: Date | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    emailVerified?: Date | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    /** ISO string (JWTs only carry JSON-serializable values) */
    emailVerified: string | null;
  }
}
