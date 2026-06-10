"use client";

import { useTransition } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import {
  LayoutDashboardIcon,
  LogOutIcon,
  MessageSquareIcon,
  ShieldIcon,
  StoreIcon,
} from "lucide-react";
import { signOutAction } from "@/server/actions/auth";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MenuUser = {
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
};

export function UserMenu({ user }: { user: MenuUser }) {
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <UserAvatar name={user.name} email={user.email} image={user.image} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {user.name ?? "Gamer"}
            </span>
            <span className="truncate font-normal">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/dashboard" />}>
          <LayoutDashboardIcon /> Dashboard
        </DropdownMenuItem>

        <DropdownMenuItem render={<Link href="/messages" />}>
          <MessageSquareIcon /> Messages
        </DropdownMenuItem>

        {user.role === "BUYER" ? (
          <DropdownMenuItem render={<Link href="/become-seller" />}>
            <StoreIcon /> Become a seller
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem render={<Link href="/seller" />}>
            <StoreIcon /> Seller hub
          </DropdownMenuItem>
        )}

        {user.role === "ADMIN" && (
          <DropdownMenuItem render={<Link href="/admin" />}>
            <ShieldIcon /> Admin panel
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={isPending}
          onClick={() => startTransition(() => signOutAction())}
        >
          <LogOutIcon /> {isPending ? "Logging out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
