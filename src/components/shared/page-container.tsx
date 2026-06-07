import { cn } from "@/lib/utils";

/**
 * Consistent page width + responsive horizontal padding.
 * Use to wrap page sections so every screen lines up to the same gutter.
 */
export function PageContainer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1120px] px-[22px]", className)}
      {...props}
    />
  );
}
