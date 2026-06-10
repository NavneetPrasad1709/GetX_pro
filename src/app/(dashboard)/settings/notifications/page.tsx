import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getEmailPreference } from "@/server/services/notifications";
import { EmailNotificationsToggle } from "@/components/settings/email-notifications-toggle";

export const metadata: Metadata = {
  title: "Notification settings",
  robots: { index: false },
};

/**
 * Notification preferences (Step 22). A single global email opt-out — in-app +
 * realtime notifications are always on. Gated by the (dashboard) layout's auth.
 */
export default async function NotificationSettingsPage() {
  const session = await requireUser();
  const emailEnabled = await getEmailPreference(session.user.id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how GETX keeps you in the loop on orders, messages and payouts.
        </p>
      </div>

      <EmailNotificationsToggle initialEnabled={emailEnabled} />
    </div>
  );
}
