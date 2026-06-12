import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getSupportTicket } from "@/server/services/support";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { CloseTicketForm } from "@/components/admin/close-ticket-form";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Support ticket — Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const timeFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function AdminSupportTicketPage({ params }: Props) {
  await requireRole("ADMIN");
  const { id } = await params;
  const ticket = await getSupportTicket(id);
  if (!ticket) notFound();

  const isOpen = ticket.status === "OPEN";

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Support", href: "/admin/support" },
          { label: ticket.subject },
        ]}
      />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">{ticket.subject}</h1>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              isOpen ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
            )}
          >
            {isOpen ? "Open" : "Closed"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {ticket.userEmail ? (
            <>
              {ticket.userName ? `${ticket.userName} · ` : ""}
              {ticket.userEmail}
            </>
          ) : (
            "Guest (not signed in)"
          )}{" "}
          · {timeFmt.format(ticket.createdAt)}
        </p>
      </div>

      {/* Transcript */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-heading text-sm font-semibold text-muted-foreground">
          Conversation
        </h2>
        <div className="flex flex-col gap-3">
          {ticket.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transcript recorded.</p>
          ) : (
            ticket.messages.map((m, i) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={i}
                  className={cn("flex", isUser ? "justify-end" : "justify-start")}
                >
                  <div className="max-w-[85%]">
                    <p
                      className={cn(
                        "mb-0.5 text-[10px] font-semibold tracking-wide uppercase",
                        isUser ? "text-right text-primary" : "text-muted-foreground",
                      )}
                    >
                      {isUser ? "User" : "GETX AI"}
                    </p>
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-2 text-[13px] whitespace-pre-wrap",
                        isUser
                          ? "bg-primary-strong text-primary-foreground"
                          : "border border-border bg-background/60",
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Resolution */}
      {isOpen ? (
        <CloseTicketForm ticketId={ticket.id} />
      ) : (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1.5 font-heading text-sm font-semibold">Resolution note</h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {ticket.adminNote?.trim() || "Closed with no note."}
          </p>
        </section>
      )}
    </div>
  );
}
