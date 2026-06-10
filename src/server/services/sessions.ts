import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Session revocation primitive (Step 32).
 *
 * We use the stateless JWT session strategy, so there are no DB session rows to
 * delete. Instead every token carries `User.sessionVersion`; bumping it makes
 * every existing token for that user fail its next periodic check (see the jwt
 * callback in src/lib/auth.ts) and get signed out within ~60s.
 *
 * Returns a PrismaPromise so it can be dropped straight into an array-form
 * `db.$transaction([...])`, keeping the bump ATOMIC with the security event
 * that triggered it (ban, role change). Pass a transaction client when you're
 * already inside an interactive transaction.
 */
export function invalidateUserSessions(
  client: PrismaClient | Prisma.TransactionClient,
  userId: string,
) {
  return client.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { id: true },
  });
}

/** Convenience standalone form (its own query) for callers outside a tx. */
export async function revokeUserSessions(userId: string): Promise<void> {
  await invalidateUserSessions(db, userId);
}
