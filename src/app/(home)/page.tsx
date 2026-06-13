import type { Metadata } from "next";
import { GetxHome } from "@/components/home/getx-home";

/**
 * Homepage (2026-06-12 redesign — docs/full-sample.html, approved).
 * Lives in its own (home) route group so it renders with the root layout only
 * (no shared marketing header/footer) — GetxHome carries its own dark chrome
 * + content light/dark toggle.
 */
export const metadata: Metadata = {
  title: "GETX — Buy & sell game accounts, safely",
  description:
    "The trust-first gaming marketplace. Escrow on every order, ID-verified sellers, instant delivery, and a free money-back guarantee.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <GetxHome />;
}
