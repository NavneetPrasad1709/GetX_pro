"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Loader2Icon } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";
import { safeCallbackUrl } from "@/lib/utils";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { TurnstileField } from "@/components/auth/turnstile-field";

const REMEMBER_KEY = "getx-remember-email";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched", // real-time: validate on blur, then re-validate as they type
    defaultValues: { email: "", password: "" },
  });

  // Prefill a remembered email (device-local convenience — never a secret).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setValue("email", saved);
        setRemember(true);
      }
    } catch {
      /* localStorage blocked — ignore */
    }
  }, [setValue]);

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const res = await loginAction(values);
    if (!res.ok) {
      setServerError(res.error ?? "Login failed. Please try again.");
      turnstileRef.current?.reset();
      setValue("turnstileToken", undefined);
      return;
    }
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, values.email);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* ignore */
    }
    router.push(safeCallbackUrl(callbackUrl));
    router.refresh(); // re-render server components (header) with the session
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
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
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          placeholder="Your password"
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

      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground select-none">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="size-4 accent-primary"
        />
        Remember my email on this device
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

      <Button type="submit" disabled={isSubmitting} className="h-11 w-full">
        {isSubmitting ? (
          <>
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Logging in…
          </>
        ) : (
          "Log in"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to GETX?{" "}
        <Link
          href="/register"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
