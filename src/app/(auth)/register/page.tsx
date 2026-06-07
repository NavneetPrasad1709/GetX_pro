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

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Join GETX — buy and sell game accounts, items and currency with escrow protection.",
};

export default function RegisterPage() {
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
        <RegisterForm />
      </CardContent>
    </Card>
  );
}
