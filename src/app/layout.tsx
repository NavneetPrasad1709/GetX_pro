import type { Metadata, Viewport } from "next";
import { Inter, Poppins, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { DeferredToaster } from "@/components/layout/deferred-toaster";
import { SiteHeader } from "@/components/layout/site-header";
import { CinematicFooter } from "@/components/layout/cinematic-footer";
import { MobileNav } from "@/components/layout/mobile-nav";
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
      {/* pb-[74px]: keeps content clear of the fixed bottom app nav (≤900px). */}
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-background pb-[74px] text-foreground min-[901px]:pb-0"
      >
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <CinematicFooter />
        <MobileNav />
        <DeferredToaster />
      </body>
    </html>
  );
}
