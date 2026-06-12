import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import type { SupportTicketStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { listSupportTickets } from "@/server/services/support";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Support — Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ status?: string }> };

const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
] as const;

const dateFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function toStatusFilter(tab: string): SupportTicketStatus | undefined {
  if (tab === "open") return "OPEN";
  if (tab === "closed") return "CLOSED";
  return undefined;
}

export default async function AdminSupportPage({ searchParams }: Props) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const active = sp.status === "open" || sp.status === "closed" ? sp.status : "all";
  const tickets = await listSupportTickets({ status: toStatusFilter(active), limit: 100 });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conversations the AI bot escalated to a human. Open one to read the full
          transcript, then close it with a note.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/admin/support" : `/admin/support?status=${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 font-heading text-sm font-semibold transition-colors",
              active === t.key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tickets.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No {active === "all" ? "" : active} tickets. 🎉
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/support/${t.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold">{t.subject}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {t.userEmail ?? "Guest"} · {dateFmt.format(t.createdAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    t.status === "OPEN"
                      ? "bg-warning/15 text-warning"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.status === "OPEN" ? "Open" : "Closed"}
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-faint" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
