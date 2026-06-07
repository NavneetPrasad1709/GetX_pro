import { requireRole } from "@/lib/auth";

/**
 * Admin area — ADMIN role only. proxy.ts gives the fast redirect; this
 * server-side check is the real gate (never trust middleware alone).
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireRole("ADMIN");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
  );
}
