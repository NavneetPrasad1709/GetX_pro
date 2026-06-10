import type { Role, KycStatus } from "@prisma/client";
import { getActionRequiredCount } from "@/server/services/orders";
import { AppTopbar } from "@/components/layout/app-topbar";
import { AppSidebarNav } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { KycStatusBanner } from "@/components/dashboard/kyc-status-banner";

type ShellUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
};

/**
 * Authenticated app shell (Prompt 01 + 06): sticky topbar + role-aware desktop
 * sidebar + main content + mobile bottom nav (app variant). Sellers get a
 * persistent KYC banner until approved; the mobile bottom nav carries an
 * action-required orders badge. No marketing chrome.
 */
export async function AppShell({
  user,
  kycStatus,
  children,
}: {
  user: ShellUser;
  kycStatus?: KycStatus;
  children: React.ReactNode;
}) {
  const ordersBadge = await getActionRequiredCount(user.id);

  return (
    <>
      <AppTopbar user={user} />
      <div className="mx-auto flex w-full max-w-[1280px] flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border px-3 py-6 min-[901px]:block">
          <AppSidebarNav role={user.role} />
        </aside>
        {/* pb-[74px] clears the fixed MobileNav on ≤900px */}
        <main className="min-w-0 flex-1 px-4 py-6 pb-[74px] min-[901px]:px-8 min-[901px]:pb-6">
          {user.role === "SELLER" && kycStatus ? (
            <KycStatusBanner kycStatus={kycStatus} />
          ) : null}
          {children}
        </main>
      </div>
      <MobileNav variant="app" role={user.role} ordersBadge={ordersBadge} />
    </>
  );
}
