import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Admin area — ADMIN role only. proxy.ts gives the fast redirect; this
 * server-side check is the real gate (never trust middleware alone). The
 * app-shell sidebar now carries every admin section (Prompt 06), so the old
 * horizontal AdminNav is no longer rendered here.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole("ADMIN");

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
        role: session.user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
