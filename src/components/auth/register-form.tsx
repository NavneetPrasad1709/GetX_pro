"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { MailCheckIcon } from "lucide-react";
import { registerSchema, type RegisterInput } from "@/lib/validators/auth";
import { registerAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileField } from "@/components/auth/turnstile-field";
import { DevLinkNotice } from "@/components/auth/dev-link-notice";

export function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: RegisterInput) {
    setServerError(null);
    const res = await registerAction(values);
    if (!res.ok) {
      setServerError(res.error ?? "Something went wrong. Please try again.");
      // Turnstile tokens are single-use — get a fresh one for the retry.
      turnstileRef.current?.reset();
      setValue("turnstileToken", undefined);
      return;
    }
    setSubmittedEmail(values.email);
    setDevLink(res.devLink ?? null);
  }

  // Success state: tell them to verify.
  if (submittedEmail) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <MailCheckIcon className="mx-auto size-10 text-primary" />
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{submittedEmail}</span>
          . You can log in right away — verifying unlocks selling.
        </p>
        {devLink && (
          <DevLinkNotice url={devLink} label="Your verification link:" />
        )}
        <Button render={<Link href="/login" />}>Go to login</Button>
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
        <Label htmlFor="register-name">Name</Label>
        <Input
          id="register-name"
          autoComplete="name"
          placeholder="Ash Ketchum"
          aria-invalid={!!errors.name}
          disabled={isSubmitting}
          {...register("name")}
        />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="register-password">Password</Label>
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters, 1 letter + 1 number"
          aria-invalid={!!errors.password}
          disabled={isSubmitting}
          {...register("password")}
        />
        {errors.password && (
          <p role="alert" className="text-sm text-destructive">
            {errors.password.message}
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

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
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
