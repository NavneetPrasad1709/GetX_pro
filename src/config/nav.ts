/**
 * Central navigation config — single source for Header, Footer and MobileNav
 * so links never drift between surfaces. Hrefs may point to routes built in
 * later steps; they are intentionally defined now for layout completeness.
 */

export type NavItem = { title: string; href: string };

/** Primary desktop header nav. */
export const mainNav: NavItem[] = [
  { title: "Browse games", href: "/games" },
  { title: "How it works", href: "/how-it-works" },
  { title: "Sell", href: "/become-seller" },
];

/** Grouped footer link columns. */
export const footerNav: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Marketplace",
    items: [
      { title: "Browse games", href: "/games" },
      { title: "Pokémon GO", href: "/games/pokemon-go" },
      { title: "Free Fire", href: "/games/free-fire" },
      { title: "Top-ups", href: "/marketplace?type=currency" },
      { title: "Boosting", href: "/marketplace?type=boosting" },
    ],
  },
  {
    heading: "Sell",
    items: [
      { title: "Start selling", href: "/become-seller" },
      { title: "Seller dashboard", href: "/dashboard" },
      { title: "Fees", href: "/fees" },
      { title: "Seller guide", href: "/seller-guide" },
      { title: "Payouts", href: "/payouts" },
    ],
  },
  {
    heading: "Company",
    items: [
      { title: "How it works", href: "/how-it-works" },
      { title: "Trust & safety", href: "/trust-safety" },
      { title: "About us", href: "/about" },
      { title: "Blog", href: "/blog" },
      { title: "Careers", href: "/careers" },
    ],
  },
  {
    heading: "Support",
    items: [
      { title: "Help center", href: "/help" },
      { title: "Open a dispute", href: "/disputes" },
      { title: "Contact us", href: "/contact" },
      { title: "Terms", href: "/terms" },
      { title: "Privacy", href: "/privacy" },
    ],
  },
];

/** Bottom app nav (mobile/tablet). `icon` resolved in the component. */
export type MobileNavItem = NavItem & {
  icon: "home" | "search" | "sell" | "orders" | "account";
};
export const mobileNav: MobileNavItem[] = [
  { title: "Home", href: "/", icon: "home" },
  { title: "Browse", href: "/games", icon: "search" },
  { title: "Sell", href: "/become-seller", icon: "sell" },
  { title: "Orders", href: "/orders", icon: "orders" },
  { title: "Account", href: "/dashboard", icon: "account" },
];

/** Social profiles — `icon` resolved in the component. */
export const socials: { label: string; href: string; icon: "discord" | "x" | "telegram" | "instagram" }[] = [
  { label: "Discord", href: "https://discord.gg/getx", icon: "discord" },
  { label: "X (Twitter)", href: "https://x.com/getx", icon: "x" },
  { label: "Telegram", href: "https://t.me/getx", icon: "telegram" },
  { label: "Instagram", href: "https://instagram.com/getx", icon: "instagram" },
];

/** Accepted payment methods shown in the footer. */
export const paymentMethods = ["UPI", "Razorpay", "USDT", "BTC", "ETH"] as const;
