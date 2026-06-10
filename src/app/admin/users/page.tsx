import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { listUsers } from "@/server/services/admin";
import { AdminSearch } from "@/components/admin/admin-search";
import { UserActions } from "@/components/admin/user-actions";

export const metadata: Metadata = { title: "Users — Admin" };

type Props = { searchParams: Promise<{ q?: string }> };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export default async function AdminUsersPage({ searchParams }: Props) {
  await requireRole("ADMIN");
  const { q } = await searchParams;
  const users = await listUsers(q);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search, ban/unban and promote. Every action is audit-logged.
        </p>
      </div>

      <AdminSearch placeholder="Search by name or email…" />

      {users.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No users found.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 min-[761px]:flex-row min-[761px]:items-center min-[761px]:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="truncate">{u.name ?? "—"}</span>
                  {u.role === "ADMIN" ? (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary-hover">
                      Admin
                    </span>
                  ) : null}
                  {u.isSeller ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Seller
                    </span>
                  ) : null}
                  {u.banned ? (
                    <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      Banned
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-xs text-faint">
                  {u.email} · joined {dateFmt.format(new Date(u.createdAt))}
                </p>
                {u.sumsubApplicantId ? (
                  <p className="mt-1 text-xs">
                    <a
                      href={`https://cockpit.sumsub.com/applicants/${u.sumsubApplicantId}/basicInfo`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-primary hover:underline"
                    >
                      View in Sumsub Cockpit ↗
                    </a>
                    {u.sumsubReviewedAt ? (
                      <span className="text-faint"> · reviewed {dateFmt.format(new Date(u.sumsubReviewedAt))}</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <UserActions userId={u.id} role={u.role} banned={u.banned} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
