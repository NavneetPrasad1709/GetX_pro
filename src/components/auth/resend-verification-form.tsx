"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  resendVerificationSchema,
  type ResendVerificationInput,
} from "@/lib/validators/auth";
import { resendVerificationAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DevLinkNotice } from "@/components/auth/dev-link-notice";

/**
 * "Didn't get the email?" form — used on the verify-email page and the
 * dashboard banner. Response is intentionally generic (anti-enumeration).
 */
export function ResendVerificationForm({
  defaultEmail = "",
}: {
  defaultEmail?: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendVerificationInput>({
    resolver: zodResolver(resendVerificationSchema),
    defaultValues: { email: defaultEmail },
  });

  async function onSubmit(values: ResendVerificationInput) {
    setServerError(null);
    const res = await resendVerificationAction(values);
    if (!res.ok) {
      setServerError(res.error ?? "Something went wrong. Please try again.");
      return;
    }
    setDevLink(res.devLink ?? null);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          If that email needs verification, a fresh link is on its way.
        </p>
        {devLink && (
          <DevLinkNotice url={devLink} label="Your verification link:" />
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
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

      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" variant="outline" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Resend verification link"}
      </Button>
    </form>
  );
}
