import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2Icon, MailWarningIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { UserServiceError, verifyEmail } from "@/server/services/users";

export const metadata: Metadata = {
  title: "Verify email",
  description: "Verify your GETX email address.",
};

type Outcome =
  | { status: "verified" | "already-verified" }
  | { status: "failed"; message: string };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;
  const email = typeof params.email === "string" ? params.email : undefined;

  // Mode 1: arriving from the email link → verify the token server-side.
  // (Work happens here; JSX stays outside the try/catch per React lint rules.)
  let outcome: Outcome | null = null;
  if (token && email) {
    try {
      outcome = { status: await verifyEmail(email, token) };
    } catch (err) {
      if (err instanceof UserServiceError) {
        outcome = { status: "failed", message: err.message };
      } else {
        console.error("[verify-email]", err);
        outcome = {
          status: "failed",
          message: "Something went wrong. Please try again.",
        };
      }
    }
  }

  if (outcome && outcome.status !== "failed") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2Icon className="mx-auto size-10 animate-in text-primary duration-500 zoom-in-50 fade-in" />
          <CardTitle className="text-xl">
            {outcome.status === "already-verified"
              ? "Email already verified"
              : "Email verified 🎉"}
          </CardTitle>
          <CardDescription>
            Your account is fully unlocked — you can now become a seller.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button render={<Link href="/login" />} className="h-11 w-full">
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

  if (outcome?.status === "failed") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <MailWarningIcon className="mx-auto size-10 text-destructive" />
          <CardTitle className="text-xl">Verification failed</CardTitle>
          <CardDescription>{outcome.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResendVerificationForm defaultEmail={email} />
        </CardContent>
      </Card>
    );
  }

  // Mode 2: no token → explain + offer a resend.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Verify your email</CardTitle>
        <CardDescription>
          We sent you a verification link when you registered. Verifying your
          email unlocks selling on GETX. Didn&apos;t get it? Resend below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResendVerificationForm />
      </CardContent>
    </Card>
  );
}
