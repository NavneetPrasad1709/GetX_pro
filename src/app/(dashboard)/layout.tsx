import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";
import { FingerprintBeacon } from "@/components/fraud/fingerprint-beacon";
import { SupportWidget } from "@/components/chat/support-widget";
import { SentryUserSync } from "@/components/shared/sentry-user-sync";
import { SentryErrorBoundary, DefaultFallback } from "@/components/shared/sentry-error-boundary";

/**
 * Protected area: buyer + seller dashboard.
 * proxy.ts already redirects anonymous visitors (optimistic), but the REAL
 * enforcement is this server-side check — never rely on middleware alone.
 * Chrome is the app shell (topbar + sidebar + mobile nav). For sellers we read
 * kycStatus once so the shell can surface the KYC banner hub-wide (Prompt 06).
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireUser();

  const profile =
    session.user.role === "SELLER"
      ? await db.sellerProfile.findUnique({
          where: { userId: session.user.id },
          select: { kycStatus: true },
        })
      : null;

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
        role: session.user.role,
      }}
      kycStatus={profile?.kycStatus}
    >
      <SentryUserSync userId={session.user.id} email={session.user.email ?? null} />
      <FingerprintBeacon />
      <SentryErrorBoundary fallback={<DefaultFallback />}>{children}</SentryErrorBoundary>
      <SupportWidget />
    </AppShell>
  );
}
