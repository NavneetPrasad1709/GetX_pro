"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";
import { safeCallbackUrl } from "@/lib/utils";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileField } from "@/components/auth/turnstile-field";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const res = await loginAction(values);
    if (!res.ok) {
      setServerError(res.error ?? "Login failed. Please try again.");
      turnstileRef.current?.reset();
      setValue("turnstileToken", undefined);
      return;
    }
    router.push(safeCallbackUrl(callbackUrl));
    router.refresh(); // re-render server components (header) with the session
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
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
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
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
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
        {isSubmitting ? "Logging in…" : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to GETX?{" "}
        <Link
          href="/register"
          className="text-foreground underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
