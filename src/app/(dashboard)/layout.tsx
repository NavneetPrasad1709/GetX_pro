import { requireUser } from "@/lib/auth";

/**
 * Protected area: buyer + seller dashboard.
 * proxy.ts already redirects anonymous visitors (optimistic), but the REAL
 * enforcement is this server-side check — never rely on middleware alone.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
  );
}
