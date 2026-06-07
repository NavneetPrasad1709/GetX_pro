import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * v10 primary CTA (".btn-sell"): the ONE source of truth for the glowing
 * blue action button. Server-safe — plain element classes, no client JS
 * (deliberately NOT built on the Base UI <Button>, which would hydrate a
 * client island for what is usually a static link).
 */
export const ctaVariants = cva(
  "accent-glow inline-flex items-center justify-center rounded-sm bg-primary-strong font-heading font-bold text-primary-foreground transition-all duration-150 hover:-translate-y-px hover:bg-primary-strong-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
  {
    variants: {
      size: {
        default: "gap-2 px-[18px] py-[11px] text-[14.5px]",
        lg: "gap-2 px-[26px] py-3.5 text-base",
      },
    },
    defaultVariants: { size: "default" },
  },
);

type Props = React.ComponentProps<typeof Link> &
  VariantProps<typeof ctaVariants>;

/** Primary CTA rendered as a link. For a real <button>, use `ctaVariants()`. */
export function CtaLink({ className, size, ...props }: Props) {
  return <Link className={cn(ctaVariants({ size }), className)} {...props} />;
}
