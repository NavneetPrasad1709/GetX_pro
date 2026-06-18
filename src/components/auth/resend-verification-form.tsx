"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Loader2Icon } from "lucide-react";
import {
  resendVerificationSchema,
  type ResendVerificationInput,
} from "@/lib/validators/auth";
import { resendVerificationAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileField } from "@/components/auth/turnstile-field";
import { DevLinkNotice } from "@/components/auth/dev-link-notice";

const HAS_TURNSTILE = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ResendVerificationInput>({
    resolver: zodResolver(resendVerificationSchema),
    mode: "onTouched",
    defaultValues: { email: defaultEmail },
  });

  async function onSubmit(values: ResendVerificationInput) {
    setServerError(null);
    const res = await resendVerificationAction(values);
    if (!res.ok) {
      setServerError(res.error ?? "Something went wrong. Please try again.");
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      setValue("turnstileToken", undefined);
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
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="flex flex-col gap-3"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          className="h-11"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "resend-email-error" : undefined}
          disabled={isSubmitting}
          {...register("email")}
        />
        {errors.email && (
          <p id="resend-email-error" role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <TurnstileField
        ref={turnstileRef}
        onToken={(token) => {
          setTurnstileToken(token);
          setValue("turnstileToken", token ?? undefined);
        }}
      />

      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        variant="outline"
        disabled={isSubmitting || (HAS_TURNSTILE && !turnstileToken)}
        className="h-11 w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          "Resend verification link"
        )}
      </Button>
    </form>
  );
}
