import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const metadata: Metadata = {
  title: "Verify email",
  description: "Verify your GETX email address.",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;
  const email = typeof params.email === "string" ? params.email : undefined;

  // Mode 1: arriving from the email link → render a Confirm-email button. The
  // single-use token is consumed by a POST server action (VerifyEmailForm), NOT
  // here on GET render, so link pre-fetchers / email scanners can't burn it.
  if (token && email) {
    return <VerifyEmailForm token={token} email={email} />;
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
