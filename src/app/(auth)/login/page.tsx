import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your GETX account.",
};

/** Friendly messages for ?error=... set by Auth.js OAuth redirects. */
function oauthErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "OAuthAccountNotLinked":
      return "This email is already registered with a different login method. Log in the way you originally signed up.";
    case "AccessDenied":
      return "Sign-in was cancelled or your email is not verified with that provider.";
    case "Configuration":
      return "Login is misconfigured. Please try again later.";
    case "CredentialsSignin":
      return "Invalid email or password.";
    default:
      return "Could not sign you in. Please try again.";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;
  const justVerified = params.verified === "1";
  const justReset = params.reset === "1";
  const oauthError = oauthErrorMessage(
    typeof params.error === "string" ? params.error : undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Log in to continue to GETX.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {justVerified && (
          <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            Email verified — you can log in now.
          </p>
        )}
        {justReset && (
          <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            Password updated — log in with your new password.
          </p>
        )}
        {oauthError && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {oauthError}
          </p>
        )}
        <OAuthButtons callbackUrl={callbackUrl} />
        <LoginForm callbackUrl={callbackUrl} />
      </CardContent>
    </Card>
  );
}
