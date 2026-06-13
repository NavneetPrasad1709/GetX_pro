import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/register-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Join GETX — buy and sell game accounts, items and currency with escrow protection.",
};

type Props = { searchParams: Promise<{ ref?: string | string[] }> };

export default async function RegisterPage({ searchParams }: Props) {
  const sp = await searchParams;
  const ref = Array.isArray(sp.ref) ? sp.ref[0] : sp.ref;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your GETX account</CardTitle>
        <CardDescription>
          Free to join. Everyone starts as a buyer — upgrade to seller anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <OAuthButtons />
        <RegisterForm referralCode={siteConfig.features.referral ? ref?.slice(0, 16) : undefined} />
      </CardContent>
    </Card>
  );
}
