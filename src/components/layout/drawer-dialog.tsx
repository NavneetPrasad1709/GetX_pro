"use client";

import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import {
  XIcon,
  StoreIcon,
  LayoutDashboardIcon,
  LogInIcon,
  UserPlusIcon,
} from "lucide-react";
import { mainNav } from "@/config/nav";
import { Logo } from "@/components/shared/icons";
import { HeaderSearch } from "@/components/layout/header-search";
import { cn } from "@/lib/utils";

const linkClass =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground transition-colors hover:bg-accent";

/**
 * The actual drawer panel (Base UI Dialog). Code-split + lazy-loaded by
 * MobileDrawer so this (and Base UI) stays out of the initial bundle until
 * the user first opens the menu. Controlled via open/onOpenChange.
 */
export function DrawerDialog({
  authed,
  open,
  onOpenChange,
}: {
  authed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <Dialog.Popup
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-xs flex-col gap-5 overflow-y-auto bg-card p-5 ring-1 ring-border outline-none",
            "duration-200 data-closed:animate-out data-closed:slide-out-to-left data-open:animate-in data-open:slide-in-from-left",
          )}
        >
          <div className="flex items-center justify-between">
            <Dialog.Close render={<Link href="/" />} aria-label="GETX home">
              <Logo className="h-6" />
            </Dialog.Close>
            <Dialog.Close
              aria-label="Close menu"
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <XIcon className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <HeaderSearch />

          <nav className="flex flex-col gap-1" aria-label="Main">
            {mainNav.map((item) => (
              <Dialog.Close key={item.href} render={<Link href={item.href} />}>
                <span className={linkClass}>{item.title}</span>
              </Dialog.Close>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
            {authed ? (
              <>
                <Dialog.Close render={<Link href="/dashboard" />}>
                  <span className={linkClass}>
                    <LayoutDashboardIcon className="size-5" /> Dashboard
                  </span>
                </Dialog.Close>
                <Dialog.Close render={<Link href="/become-seller" />}>
                  <span className={linkClass}>
                    <StoreIcon className="size-5" /> Start selling
                  </span>
                </Dialog.Close>
              </>
            ) : (
              <>
                <Dialog.Close render={<Link href="/login" />}>
                  <span className={linkClass}>
                    <LogInIcon className="size-5" /> Log in
                  </span>
                </Dialog.Close>
                <Dialog.Close render={<Link href="/register" />}>
                  <span className="flex items-center gap-3 rounded-lg bg-primary-strong px-3 py-2.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-strong-hover">
                    <UserPlusIcon className="size-5" /> Sign up — it&apos;s free
                  </span>
                </Dialog.Close>
              </>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
