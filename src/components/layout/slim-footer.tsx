import Link from "next/link";
import { Logo } from "@/components/shared/icons";

const LEGAL_LINKS = [
  { title: "Terms", href: "/terms" },
  { title: "Privacy", href: "/privacy" },
  { title: "Fees", href: "/fees" },
  { title: "Help", href: "/help" },
];

/**
 * Slim shop footer (Prompt 01): a single thin row — copyright + legal links.
 * No GSAP, no animations, pure RSC. The cinematic footer is reserved for
 * marketing routes only. (Payment-method chips removed — O-T10.)
 */
export function SlimFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-5 gap-y-3 px-[22px] py-4 font-heading text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Logo className="h-4" />© {year} GETX
        </span>

        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.title}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
