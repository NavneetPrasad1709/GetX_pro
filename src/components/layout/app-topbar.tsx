import Link from "next/link";
import { MessageSquareIcon } from "lucide-react";
import type { Role } from "@prisma/client";
import { countUnread } from "@/server/services/chat";
import { loadNotificationBell } from "@/server/services/notifications";
import { Logo } from "@/components/shared/icons";
import { NotificationBell } from "@/components/shared/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";

type TopbarUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
};

/**
 * App shell topbar (Prompt 01): logo + messages link + notification bell +
 * avatar. RSC — the chat unread count and the bell's notification feed are read
 * server-side in parallel (P6-T1: the bell now lives on the dashboard chrome).
 */
export async function AppTopbar({ user }: { user: TopbarUser }) {
  const [unread, bell] = await Promise.all([
    countUnread(user.id),
    loadNotificationBell(user.id),
  ]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-[rgba(10,11,13,0.96)] backdrop-blur-[12px]">
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-3 px-4 min-[901px]:px-8">
        <Link
          href="/"
          aria-label="GETX home"
          className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logo className="h-6" />
        </Link>

        {/* search placeholder (desktop) — wired in a later step */}
        <div className="ml-4 hidden max-w-xs flex-1 min-[901px]:flex">
          <input
            disabled
            aria-label="Search GETX"
            title="Search coming soon"
            placeholder="Search GETX…"
            className="w-full rounded-md bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-faint disabled:cursor-not-allowed"
          />
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/messages"
            aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
            className="relative rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <MessageSquareIcon className="size-5" aria-hidden="true" />
            {unread > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary-strong px-1 text-[10px] font-bold text-primary-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>

          <NotificationBell
            initialUnread={bell.unread}
            initialNotifications={bell.items}
          />

          <UserMenu
            user={{
              name: user.name,
              email: user.email,
              image: user.image,
              role: user.role,
            }}
          />
        </div>
      </div>
    </header>
  );
}
