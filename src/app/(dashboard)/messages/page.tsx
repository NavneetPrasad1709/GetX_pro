import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listConversations } from "@/server/services/chat";
import { EmptyState } from "@/components/shared/empty-state";
import { CtaLink } from "@/components/shared/cta-link";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export default async function MessagesPage() {
  const session = await requireUser();
  const conversations = await listConversations(session.user.id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chat privately with buyers and sellers — in real time.
        </p>
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          icon={<MessageSquareIcon />}
          headingLevel="h2"
          title="No messages yet"
          description="Start a conversation from a listing or one of your orders — it'll show up here."
          action={<CtaLink href="/marketplace">Browse marketplace</CtaLink>}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <UserAvatar name={c.otherName} image={c.otherImage} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{c.otherName}</p>
                    {c.lastMessageAt ? (
                      <span className="shrink-0 text-[11px] text-faint">
                        {dateFmt.format(new Date(c.lastMessageAt))}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      "truncate text-xs",
                      c.unreadCount > 0
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {c.lastMessage ?? "No messages yet"}
                  </p>
                </div>
                {c.unreadCount > 0 ? (
                  <span
                    aria-label={`${c.unreadCount} unread`}
                    className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary-strong px-1.5 text-[11px] font-bold text-primary-foreground"
                  >
                    {c.unreadCount}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
