"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { gamesNav } from "@/config/nav";
import { cn } from "@/lib/utils";

/**
 * Games mega-nav (Prompt 02) — desktop hover/keyboard panel listing all launch
 * games with 4 category deep-links each. Pure static data from `gamesNav`; only
 * the open/close interactivity is client-side. Desktop-only (rendered inside
 * NavLinks, which is `hidden min-[901px]:flex`).
 */
export function GamesMegaNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Link
        href="/games"
        aria-haspopup="true"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-[13px] py-[9px] font-heading text-[14.5px] font-medium transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Games
        <ChevronDownIcon
          className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")}
          aria-hidden="true"
        />
      </Link>

      {open ? (
        <div
          role="region"
          aria-label="Browse by game"
          className="absolute top-full left-0 z-60 mt-1 w-[min(680px,90vw)] rounded-lg border border-border bg-card p-3 shadow-lg"
        >
          <div className="grid grid-cols-2 gap-1.5 min-[1024px]:grid-cols-3">
            {gamesNav.map((game) => (
              <div key={game.slug} className="rounded-md p-2 transition-colors hover:bg-accent">
                <Link
                  href={game.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 font-heading text-sm font-semibold text-foreground focus-visible:outline-none"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded bg-secondary font-mono text-[10px] font-bold text-foreground/40">
                    {game.mono}
                  </span>
                  {game.name}
                </Link>
                <ul className="mt-1.5 flex flex-col gap-0.5 pl-9">
                  {game.categories.map((cat) => (
                    <li key={cat.href}>
                      <Link
                        href={cat.href}
                        onClick={() => setOpen(false)}
                        className="text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
                      >
                        {cat.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
