"use client";

import dynamic from "next/dynamic";

// Toasts are never needed at first paint — load sonner after hydration so it
// stays out of the critical bundle.
const Toaster = dynamic(
  () => import("@/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false },
);

export function DeferredToaster() {
  return <Toaster theme="dark" richColors position="top-center" />;
}
