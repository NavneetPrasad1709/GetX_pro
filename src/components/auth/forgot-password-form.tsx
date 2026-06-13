"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { MailCheckIcon, Loader2Icon } from "lucide-react";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/validators/auth";
import { forgotPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileField } from "@/components/auth/turnstile-field";
import { DevLinkNotice } from "@/components/auth/dev-link-notice";

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onTouched",
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setServerError(null);
    const res = await forgotPasswordAction(values);
    if (!res.ok) {
      setServerError(res.error ?? "Something went wrong. Please try again.");
      turnstileRef.current?.reset();
      setValue("turnstileToken", undefined);
      return;
    }
    setDevLink(res.devLink ?? null);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <MailCheckIcon className="mx-auto size-10 text-primary" />
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          If an account exists for that email, we sent a password reset link.
          It expires in 1 hour.
        </p>
        {devLink && <DevLinkNotice url={devLink} label="Your reset link:" />}
        <Button
          variant="outline"
          render={<Link href="/login" />}
          className="h-11 w-full"
        >
          Back to login
        </Button>
      </div>
    );
  }

  return (
    <form
      // handleSubmit is invoked at event time (not render) — keeps the
      // turnstile ref access out of render per react-hooks/refs.
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          className="h-11"
          aria-invalid={!!errors.email}
          disabled={isSubmitting}
          {...register("email")}
        />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <TurnstileField
        ref={turnstileRef}
        onToken={(token) => setValue("turnstileToken", token ?? undefined)}
      />

      {serverError && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="h-11 w-full">
        {isSubmitting ? (
          <>
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          "Send reset link"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="text-foreground underline underline-offset-4"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
