"use client";

import * as React from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide toggle (44px touch target, never focus-trapped
 * via tabIndex=-1 so keyboard users tab straight to the next field). Forwards the
 * react-hook-form ref through to the underlying input (React 19 ref-as-prop).
 */
export function PasswordInput({
  className,
  ref,
  ...props
}: React.ComponentProps<"input">) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        className={cn("h-11 pr-11", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
      >
        {show ? (
          <EyeOffIcon className="size-[18px]" aria-hidden="true" />
        ) : (
          <EyeIcon className="size-[18px]" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/** 0–4 strength score from length + character-class variety. */
function scorePassword(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

const STRENGTH = [
  { label: "Too short", bar: "bg-destructive" },
  { label: "Weak", bar: "bg-destructive" },
  { label: "Fair", bar: "bg-warning" },
  { label: "Good", bar: "bg-primary" },
  { label: "Strong", bar: "bg-success" },
] as const;

/** Live password-strength meter (4 bars + label). Renders nothing when empty. */
export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const score = scorePassword(value);
  const filled = Math.max(1, score);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < filled ? STRENGTH[score].bar : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Password strength:{" "}
        <span className="font-medium text-foreground">
          {STRENGTH[score].label}
        </span>
      </p>
    </div>
  );
}
