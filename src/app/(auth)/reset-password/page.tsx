import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password for your GETX account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;
  const email = typeof params.email === "string" ? params.email : undefined;

  // Token/email come from the emailed link — without them there is nothing to reset.
  if (!token || !email) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invalid reset link</CardTitle>
          <CardDescription>
            This page only works from a password reset link. Request a new one
            below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/forgot-password" />}>
            Request reset link
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>
          Resetting the password for{" "}
          <span className="font-medium text-foreground">{email}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm email={email} token={token} />
      </CardContent>
    </Card>
  );
}
