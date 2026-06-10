/**
 * Central navigation config — single source for Header, Footer and MobileNav
 * so links never drift between surfaces. Hrefs may point to routes built in
 * later steps; they are intentionally defined now for layout completeness.
 */

import { GAME_COPY } from "@/config/games";

export type NavItem = { title: string; href: string };

/** Primary desktop header nav (marketplace IA: discover · sell · help). */
export const mainNav: NavItem[] = [
  { title: "Marketplace", href: "/marketplace" },
  { title: "Games", href: "/games" }, // triggers the games mega-nav (NavLinks)
  { title: "Sell", href: "/become-seller" },
  { title: "Help", href: "/help" },
];

/**
 * Games mega-nav data (Prompt 02) — built statically from GAME_COPY so the
 * header stays a zero-async server component. Category links use the live
 * `/marketplace?game=&type=` URL contract (no DB-seeded category slugs needed).
 */
export type GameNavCategory = {
  label: string;
  typeParam: "account" | "item" | "currency" | "boosting";
};
export const GAME_NAV_CATEGORIES: GameNavCategory[] = [
  { label: "Accounts", typeParam: "account" },
  { label: "Items", typeParam: "item" },
  { label: "Top-ups", typeParam: "currency" },
  { label: "Boosting", typeParam: "boosting" },
];
export type GameNavItem = {
  slug: string;
  name: string;
  mono: string;
  image: string | null;
  href: string; // /games/[slug]
  categories: { label: string; href: string }[];
};
export const gamesNav: GameNavItem[] = GAME_COPY.map((g) => ({
  slug: g.slug,
  name: g.name,
  mono: g.mono,
  image: g.image,
  href: `/games/${g.slug}`,
  categories: GAME_NAV_CATEGORIES.map((cat) => ({
    label: cat.label,
    href: `/marketplace?game=${g.slug}&type=${cat.typeParam}`,
  })),
}));

/** Grouped footer link columns. Game + category columns (Prompt 17) pass crawl
 *  equity from EVERY page to the catalog — footer renders site-wide. */
export const footerNav: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Games",
    items: [
      { title: "All games", href: "/games" },
      ...GAME_COPY.map((g) => ({ title: g.name, href: `/games/${g.slug}` })),
    ],
  },
  {
    heading: "Top categories",
    items: [
      { title: "Pokémon GO accounts", href: "/games/pokemon-go/accounts" },
      { title: "Pokémon GO PokéCoins", href: "/games/pokemon-go/pokecoins" },
      { title: "Clash of Clans gems", href: "/games/clash-of-clans/gems" },
      { title: "Valorant accounts", href: "/games/valorant/accounts" },
      { title: "Free Fire diamonds", href: "/games/free-fire/diamonds" },
      { title: "PUBG Mobile UC", href: "/games/pubg-mobile/uc" },
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
    heading: "Community",
    items: [
      { title: "Guides", href: "/guides" },
      { title: "Leaderboards", href: "/leaderboards" },
      { title: "How it works", href: "/how-it-works" },
      { title: "Trust & safety", href: "/trust-safety" },
      { title: "About us", href: "/about" },
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
  icon: "home" | "search" | "messages" | "orders" | "account";
};
// Prompt 07: Messages gets a dedicated tab (with unread badge); the one-time
// "Sell" FAB is dropped — selling now lives in the role-aware drawer.
export const mobileNav: MobileNavItem[] = [
  { title: "Home", href: "/", icon: "home" },
  { title: "Browse", href: "/games", icon: "search" },
  { title: "Messages", href: "/messages", icon: "messages" },
  { title: "Orders", href: "/orders", icon: "orders" },
  { title: "Account", href: "/dashboard", icon: "account" },
];

/**
 * Authenticated app-shell nav (Prompt 01) — single source for the desktop
 * sidebar (AppSidebarNav) and the mobile bottom nav (app variant) so they
 * never drift. `roles` undefined = visible to every signed-in role.
 */
export type AppNavItem = NavItem & {
  icon: "dashboard" | "orders" | "messages" | "store" | "shield";
  roles?: Array<"BUYER" | "SELLER" | "ADMIN">;
};
export const appNav: AppNavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { title: "Orders", href: "/orders", icon: "orders" },
  { title: "Messages", href: "/messages", icon: "messages" },
  { title: "Seller", href: "/seller", icon: "store", roles: ["SELLER", "ADMIN"] },
  { title: "Admin", href: "/admin", icon: "shield", roles: ["ADMIN"] },
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
