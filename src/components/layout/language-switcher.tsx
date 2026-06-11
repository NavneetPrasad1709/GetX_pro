"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import { GlobeIcon, CheckIcon } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Language switcher (Step 23). Flips between English (clean URLs) and Hindi
 * (`/hi/…`) while preserving the current path + query. next-intl sets the
 * `NEXT_LOCALE` cookie automatically on navigation — no manual cookie handling.
 *
 * NOTE: this is wired during i18n activation (see docs/DECISIONS.md Step 23) —
 * it depends on the next-intl provider + the [locale] routing being live.
 */
const LABELS: Record<string, { flag: string; name: string }> = {
  en: { flag: "🇬🇧", name: "English" },
  hi: { flag: "🇮🇳", name: "हिन्दी" },
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(next: string) {
    setOpen(false);
    if (next === locale) return;
    // router.replace preserves the path; query params ride along via the URL.
    router.replace(pathname, { locale: next as (typeof routing.locales)[number] });
  }

  const current = LABELS[locale] ?? LABELS.en;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change language"
      >
        <GlobeIcon className="size-4" aria-hidden="true" />
        <span>{current.flag}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 min-w-[150px] overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {routing.locales.map((loc) => {
            const l = LABELS[loc];
            const active = loc === locale;
            return (
              <button
                key={loc}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => pick(loc)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-background ${
                  active ? "font-semibold text-primary" : "text-foreground"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">{l.flag}</span>
                  {l.name}
                </span>
                {active ? <CheckIcon className="size-4 text-primary" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
