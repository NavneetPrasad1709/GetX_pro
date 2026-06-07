import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Brand + social glyphs as inline SVGs (lucide dropped most brand marks).
 * Pure presentational, server-safe. All decorative → aria-hidden.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

export function DiscordIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20 5a18 18 0 0 0-4.5-1.4l-.2.4A16 16 0 0 1 18 5.3a16 16 0 0 0-12 0 16 16 0 0 1 2.7-1.3l-.2-.4A18 18 0 0 0 4 5 19 19 0 0 0 1 18a18 18 0 0 0 5.5 2l.7-1.2a11 11 0 0 1-1.8-.9l.4-.3a12 12 0 0 0 10.4 0l.4.3a11 11 0 0 1-1.8.9l.7 1.2A18 18 0 0 0 23 18 19 19 0 0 0 20 5ZM9 14.5A1.6 1.6 0 0 1 7.5 13 1.6 1.6 0 0 1 9 11.5 1.6 1.6 0 0 1 10.5 13 1.6 1.6 0 0 1 9 14.5Zm6 0A1.6 1.6 0 0 1 13.5 13 1.6 1.6 0 0 1 15 11.5 1.6 1.6 0 0 1 16.5 13 1.6 1.6 0 0 1 15 14.5Z" />
    </svg>
  );
}

export function XBrandIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18 2h3l-7 8 8 12h-6l-5-7-5 7H1l8-9L1 2h6l4 6 7-6Zm-1 18h2L7 4H5l12 16Z" />
    </svg>
  );
}

export function TelegramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="m22 3-20 8 5 2 2 6 3-4 5 4 5-16ZM9 15l-.5 4 2-3 7-7-8.5 6Z" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const socialIcons = {
  discord: DiscordIcon,
  x: XBrandIcon,
  telegram: TelegramIcon,
  instagram: InstagramIcon,
} as const;

/** v10 "AI" glyph (sun-burst) used by the AI Dispute Judge feature card. */
export function AiSparkIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M5 12H2M22 12h-3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </svg>
  );
}

/** v10 rupee-in-circle glyph used by the Lowest fees feature card. */
export function RupeeCircleIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9h4.5a1.5 1.5 0 0 1 0 3H9m0 0h5" />
    </svg>
  );
}

/**
 * GETX logo — the real brand asset (public/getx-logo.webp, 2089×753).
 * Size it with a height class (e.g. `h-[27px]`); width stays auto to keep
 * the aspect ratio. `priority` only for the above-the-fold header instance.
 */
export function Logo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/getx-logo.webp"
      alt="GETX"
      width={2089}
      height={753}
      priority={priority}
      className={cn("h-[27px] w-auto", className)}
    />
  );
}
