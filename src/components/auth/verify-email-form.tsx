"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2Icon,
  Loader2Icon,
  MailCheckIcon,
  MailWarningIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyEmailAction } from "@/server/actions/auth";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

type Status = "idle" | "verifying" | "success" | "error";

/**
 * Email verification is consumed via this POST action — NOT on a GET render.
 * Email-security scanners and link pre-fetchers issue unattended GETs the moment
 * a message lands; doing the token-consuming mutation on render let them burn
 * the single-use token before the human clicked. A same-origin POST (button)
 * is not something a scanner performs, so the token survives until the user acts.
 */
export function VerifyEmailForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setStatus("verifying");
    setError(null);
    const res = await verifyEmailAction({ token, email });
    if (res.ok) {
      setStatus("success");
    } else {
      setError(res.error ?? "Verification failed. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2Icon className="mx-auto size-10 animate-in text-primary duration-500 zoom-in-50 fade-in" />
          <CardTitle className="text-xl">Email verified 🎉</CardTitle>
          <CardDescription>
            Your account is fully unlocked — you can now become a seller.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button render={<Link href="/login?verified=1" />} className="h-11 w-full">
            Log in
          </Button>
          <Button
            variant="outline"
            render={<Link href="/" />}
            className="h-11 w-full"
          >
            Back to home
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <MailWarningIcon className="mx-auto size-10 text-destructive" />
          <CardTitle className="text-xl">Verification failed</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResendVerificationForm defaultEmail={email} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <MailCheckIcon className="mx-auto size-10 text-primary" />
        <CardTitle className="text-xl">Confirm your email</CardTitle>
        <CardDescription>
          Click below to verify{" "}
          <span className="font-medium text-foreground">{email}</span> and
          finish setting up your GETX account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={status === "verifying"}
          className="h-11 w-full"
        >
          {status === "verifying" ? (
            <>
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
              Verifying…
            </>
          ) : (
            "Verify my email"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
