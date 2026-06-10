import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Poppins, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { DeferredToaster } from "@/components/layout/deferred-toaster";
import { OrganizationJsonLd } from "@/components/seo/organization-jsonld";
import { SwRegister } from "@/components/pwa/sw-register";
import { InstallBanner } from "@/components/pwa/install-banner";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { PostHogPageview } from "@/components/analytics/posthog-pageview";
import { siteConfig } from "@/config/site";

// v10 brand: Poppins for display/UI, Inter for body copy, JetBrains Mono for chips.
const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const poppins = Poppins({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
// Mono is only used below the fold (footer chips, step numbers) → don't preload.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — Gaming Marketplace`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  // PWA (Step 24) — installable app metadata.
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GETX",
  },
  icons: {
    icon: "/favicon.webp",
    apple: "/icons/apple-touch-icon.png",
  },
  other: {
    "msapplication-TileColor": "#4d7cfe",
    "msapplication-TileImage": "/icons/icon-192x192.png",
  },
  keywords: [
    "game accounts",
    "buy game accounts",
    "sell game accounts",
    "Pokemon GO accounts",
    "in-game items",
    "game top-ups",
    "escrow marketplace",
  ],
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `${siteConfig.name} — Gaming Marketplace`,
    description: siteConfig.description,
    images: [{ url: "/getx-mark.webp", width: 1254, height: 1254, alt: siteConfig.name }],
  },
  // card: "summary" (not summary_large_image) on purpose — our only share
  // asset today is the square logo mark, which a large card would crop badly.
  // Flip to summary_large_image once a real 1200×630 banner exists (owner
  // asset; see DECISIONS.md Step 05 row).
  twitter: {
    card: "summary",
    title: `${siteConfig.name} — Gaming Marketplace`,
    description: siteConfig.description,
    images: ["/getx-mark.webp"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${poppins.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning: browser extensions (ColorZilla, Grammarly...)
          inject attributes into <body> before React hydrates. This only mutes
          attribute mismatches on <body> itself — real bugs in children still warn. */}
      {/* Chrome (header/footer/bottom-nav) lives in per-group layout shells
          (Prompt 01), not here — root is bare providers only. */}
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-background text-foreground"
      >
        {/* Analytics (Step 31) — PostHog renders children directly when no key is set (no overhead) */}
        <PostHogProvider>
          <Suspense fallback={null}>
            <PostHogPageview />
          </Suspense>
          {children}
          <OrganizationJsonLd />
          <DeferredToaster />
          {/* PWA (Step 24) — rendered after content, both no-op until mounted (never block FCP) */}
          <SwRegister />
          <InstallBanner />
        </PostHogProvider>
      </body>
    </html>
  );
}
