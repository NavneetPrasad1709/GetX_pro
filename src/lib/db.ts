import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 * Next.js hot-reload can create many PrismaClient instances in dev and exhaust
 * database connections — so we cache one instance on globalThis.
 * Always import `db` from here. Never call `new PrismaClient()` elsewhere.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
