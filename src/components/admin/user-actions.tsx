"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { banUserAction, setUserRoleAction } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";

/** Ban/unban + promote/demote a user (Step 15). Self-ban / self-role blocked server-side. */
export function UserActions({
  userId,
  role,
  banned,
}: {
  userId: string;
  role: Role;
  banned: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Action failed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="xs"
          variant={banned ? "outline" : "destructive"}
          disabled={isPending}
          onClick={() => run(() => banUserAction({ userId, banned: !banned }))}
        >
          {banned ? "Unban" : "Ban"}
        </Button>
        {role === "ADMIN" ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => setUserRoleAction({ userId, role: "BUYER" }))}
          >
            Remove admin
          </Button>
        ) : (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => setUserRoleAction({ userId, role: "ADMIN" }))}
          >
            Make admin
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
