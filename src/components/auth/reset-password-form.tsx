"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/validators/auth";
import { resetPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email, token, password: "" },
  });

  async function onSubmit(values: ResetPasswordInput) {
    setServerError(null);
    const res = await resetPasswordAction(values);
    if (!res.ok) {
      setServerError(res.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.push("/login?reset=1");
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {/* email + token ride along via defaultValues; the server re-validates both */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
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

      {serverError && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
