"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { MailCheckIcon, Loader2Icon } from "lucide-react";
import { registerSchema, type RegisterInput } from "@/lib/validators/auth";
import { registerAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PasswordInput,
  PasswordStrength,
} from "@/components/auth/password-input";
import { TurnstileField } from "@/components/auth/turnstile-field";
import { DevLinkNotice } from "@/components/auth/dev-link-notice";

export function RegisterForm({ referralCode }: { referralCode?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onTouched", // real-time validation feedback
    defaultValues: { name: "", email: "", password: "", ref: referralCode },
  });

  const password = watch("password") ?? "";

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
        <span className="mx-auto grid size-14 animate-in place-items-center rounded-2xl bg-primary/10 text-primary duration-500 zoom-in-50 fade-in">
          <MailCheckIcon className="size-7" aria-hidden="true" />
        </span>
        <h2 className="font-heading text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{submittedEmail}</span>.
          You can log in right away — verifying unlocks selling.
        </p>
        {devLink && (
          <DevLinkNotice url={devLink} label="Your verification link:" />
        )}
        <Button render={<Link href="/login" />} className="h-11 w-full">
          Go to login
        </Button>
      </div>
    );
  }

  return (
    <form
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
          className="h-11"
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="register-password">Password</Label>
        <PasswordInput
          id="register-password"
          autoComplete="new-password"
          placeholder="At least 8 characters, 1 letter + 1 number"
          aria-invalid={!!errors.password}
          disabled={isSubmitting}
          {...register("password")}
        />
        {errors.password ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        ) : (
          <PasswordStrength value={password} />
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground select-none">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={isSubmitting}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          I agree to GETX&apos;s{" "}
          <Link
            href="/terms"
            target="_blank"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Terms of Service
          </Link>
          .
        </span>
      </label>

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

      <Button
        type="submit"
        disabled={isSubmitting || !agreed}
        className="h-11 w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Creating account…
          </>
        ) : (
          "Create account"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
