"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BellIcon, CheckCircle2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { captureDemandAction } from "@/server/actions/demand";

/**
 * Anonymous demand capture for empty categories (Prompt 12). Turns a dead-end
 * empty grid into a lead: the buyer leaves an email and we notify them when a
 * verified seller lists here. No auth, no password — just intent capture.
 */

const formSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});
type FormInput = z.infer<typeof formSchema>;

type Props = {
  gameId: string;
  categoryId: string;
  gameName: string;
  categoryName: string;
  /** "full" = category page hero · "compact" = inline on the game landing page */
  variant?: "full" | "compact";
  className?: string;
};

export function DemandCaptureCard({
  gameId,
  categoryId,
  gameName,
  categoryName,
  variant = "full",
  className,
}: Props) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const res = await captureDemandAction({
        email: values.email,
        categoryId,
        gameId,
      });
      if (res.ok) {
        setDone(true);
        toast.success("You're on the list! We'll email you when a seller lists here.");
      } else {
        toast.error(res.error);
      }
    });
  });

  const compact = variant === "compact";

  if (done) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border border-success/30 bg-success/8 p-4",
          className,
        )}
      >
        <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-hidden="true" />
        <p className="text-sm text-foreground">
          You&apos;re on the list! We&apos;ll email you the moment a verified
          seller lists {gameName} {categoryName.toLowerCase()}.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/60",
        compact ? "p-4" : "p-5 min-[761px]:p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
          <BellIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "font-heading font-bold text-foreground",
              compact ? "text-sm" : "text-base min-[761px]:text-lg",
            )}
          >
            Be the first to know when {gameName} {categoryName} go live
          </h3>
          {!compact && (
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              Enter your email — we&apos;ll notify you the moment a verified
              seller lists here. No spam.
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2" noValidate>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@email.com"
              aria-label="Email address"
              aria-invalid={!!errors.email}
              disabled={pending}
              {...register("email")}
            />
            {errors.email && (
              <p role="alert" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Adding you…" : "Notify me"}
            </Button>
          </form>

          <p className="mt-3 text-xs text-muted-foreground">
            Are you a seller?{" "}
            <Link
              href="/become-seller"
              className="font-semibold text-primary hover:text-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              List yours →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
