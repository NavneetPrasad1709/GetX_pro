"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BellIcon, CheckCheckIcon, SettingsIcon } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/server/actions/notifications";
import type { NotificationRow } from "@/server/services/notifications";
import { cn } from "@/lib/utils";

const BADGE_MAX = 99;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

type Props = {
  initialUnread: number;
  initialNotifications: NotificationRow[];
};

export function NotificationBell({ initialUnread, initialNotifications }: Props) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationRow[]>(initialNotifications);
  const [loaded, setLoaded] = useState(false);
  const seenIds = useRef<Set<string>>(new Set(initialNotifications.map((n) => n.id)));
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const socket = useSocket();

  // Realtime: a new notification arrives → dedupe, bump the badge, prepend.
  useEffect(() => {
    if (!socket) return;
    const onNew = (n: NotificationRow) => {
      if (!n?.id || seenIds.current.has(n.id)) return;
      seenIds.current.add(n.id);
      setUnread((u) => u + 1);
      setItems((prev) => [n, ...prev].slice(0, 20));
    };
    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
  }, [socket]);

  // Close on Escape + outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Lazy-refresh the list the first time the dropdown opens.
  const refresh = useCallback(async () => {
    const res = await getNotificationsAction();
    if (res.ok) {
      setItems(res.notifications);
      setUnread(res.unread);
      res.notifications.forEach((n) => seenIds.current.add(n.id));
    }
    setLoaded(true);
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next && !loaded) void refresh();
      return next;
    });
  }, [loaded, refresh]);

  const handleRead = useCallback((id: string, isRead: boolean) => {
    if (isRead) return;
    // Optimistic: flip locally + decrement, then persist.
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    void markNotificationReadAction({ notificationId: id });
  }, []);

  const handleMarkAll = useCallback(async () => {
    if (unread === 0) return;
    // Snapshot for revert if the server rejects.
    const prevItems = items;
    const prevUnread = unread;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    const res = await markAllNotificationsReadAction();
    if (!res.ok) {
      setItems(prevItems);
      setUnread(prevUnread);
    }
  }, [unread, items]);

  const badge = unread > BADGE_MAX ? `${BADGE_MAX}+` : String(unread);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        className="relative rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <BellIcon className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary-strong px-1 text-[10px] font-bold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unread === 0}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <CheckCheckIcon className="size-3.5" aria-hidden="true" />
              Mark all read
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {loaded ? "You're all caught up." : "Loading…"}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <NotificationItem n={n} onRead={handleRead} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-4 py-2">
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <SettingsIcon className="size-3.5" aria-hidden="true" />
              Notification settings
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationItem({
  n,
  onRead,
  onNavigate,
}: {
  n: NotificationRow;
  onRead: (id: string, isRead: boolean) => void;
  onNavigate: () => void;
}) {
  const inner = (
    <div className="flex gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          n.read ? "bg-transparent" : "bg-primary-strong",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", n.read ? "text-muted-foreground" : "font-semibold text-foreground")}>
          {n.title}
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
      </div>
    </div>
  );

  const base =
    "block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none";

  if (n.link) {
    return (
      <Link
        href={n.link}
        onClick={() => {
          onRead(n.id, n.read);
          onNavigate();
        }}
        className={base}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onRead(n.id, n.read)} className={base}>
      {inner}
    </button>
  );
}
