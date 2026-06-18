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
const HAS_TURNSTILE = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  // Gate submit on a ready Turnstile token so a click during the widget's
  // ~0.5–2s auto-solve doesn't send an empty token and fail correct credentials.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Terminal "redirecting" state: keep the form locked from the moment login
  // succeeds until /dashboard paints, so a double-click can't re-fire login.
  const [redirecting, setRedirecting] = useState(false);
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
  // `remember` already defaults to true, so we only need to set the email here.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) setValue("email", saved);
    } catch {
      /* localStorage blocked — ignore */
    }
  }, [setValue]);

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const res = await loginAction(values);
    if (!res.ok) {
      setServerError(res.error ?? "Login failed. Please try again.");
      // Turnstile tokens are single-use — re-arm for the retry.
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      setValue("turnstileToken", undefined);
      return;
    }
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, values.email);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* ignore */
    }
    // Lock the form for the rest of the navigation (component unmounts on nav).
    setRedirecting(true);
    // Refresh FIRST (invalidate the logged-out RSC cache + header), THEN navigate
    // once. Pushing then refreshing rendered the heavy dashboard twice (~2x slower).
    router.refresh();
    router.replace(safeCallbackUrl(callbackUrl));
  }

  const busy = isSubmitting || redirecting;
  const submitDisabled = busy || (HAS_TURNSTILE && !turnstileToken);

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
          aria-describedby={errors.email ? "login-email-error" : undefined}
          disabled={busy}
          {...register("email")}
        />
        {errors.email && (
          <p id="login-email-error" role="alert" className="text-sm text-destructive">
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
          aria-describedby={errors.password ? "login-password-error" : undefined}
          disabled={busy}
          {...register("password")}
        />
        {errors.password && (
          <p id="login-password-error" role="alert" className="text-sm text-destructive">
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
        onToken={(token) => {
          setTurnstileToken(token);
          setValue("turnstileToken", token ?? undefined);
        }}
      />

      {serverError && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={submitDisabled} className="h-11 w-full">
        {busy ? (
          <>
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            {redirecting ? "Signing you in…" : "Logging in…"}
          </>
        ) : (
          "Log in"
        )}
      </Button>
      {HAS_TURNSTILE && !turnstileToken && !busy && (
        <p className="text-center text-xs text-muted-foreground">
          Verifying you’re human…
        </p>
      )}

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
