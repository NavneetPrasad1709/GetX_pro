"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MenuIcon } from "lucide-react";

// Base UI Dialog is heavy and mobile-only — load it on first tap, not on boot.
const DrawerDialog = dynamic(
  () => import("@/components/layout/drawer-dialog").then((m) => m.DrawerDialog),
  { ssr: false },
);

/** Hamburger button (always present) that lazily mounts the drawer panel. */
export function MobileDrawer({ authed }: { authed: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        className="grid size-9 place-items-center rounded-sm text-foreground transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none min-[901px]:hidden"
      >
        <MenuIcon className="size-5" aria-hidden="true" />
      </button>

      {mounted ? (
        <DrawerDialog authed={authed} open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
