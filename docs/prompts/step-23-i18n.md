# STEP 23 — Multi-language Support (next-intl: English + Hindi)

> Goal: Make every UI string in GETX translatable via next-intl, ship accurate English + Hindi
> translations for all user-facing chrome, add a header language switcher with URL-based routing,
> and wire locale-aware number/date formatting throughout.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Full-Stack Engineer + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§6, §7). Work in `D:\GetX`. This is **Step 23 — Multi-language (next-intl)**.
Talk Hinglish. Follow the full workflow.

### Task

1. **Install + configure next-intl** (`package.json`, `next.config.ts`, `src/middleware.ts` /
   `src/proxy.ts`):

   - `npm install next-intl` (latest stable, verify compatibility with Next.js 16 App Router).
   - In `next.config.ts`, do **not** add a top-level `i18n` block (that is Pages Router only).
     Instead, rely entirely on next-intl's App Router plugin:
     ```ts
     import createNextIntlPlugin from 'next-intl/plugin';
     const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
     export default withNextIntl(nextConfig);
     ```
   - Supported locales: `['en', 'hi']`, default locale: `'en'`.
   - URL strategy — **prefix-except-default**: `/hi/...` for Hindi, no prefix for English (so
     `/` and `/listing/…` stay clean for SEO; `/hi/` and `/hi/listing/…` for Hindi).
     Configure this in next-intl middleware via `routing` with `localePrefix: 'as-needed'`.
   - Create `src/i18n/routing.ts`:
     ```ts
     import { defineRouting } from 'next-intl/routing';
     export const routing = defineRouting({
       locales: ['en', 'hi'],
       defaultLocale: 'en',
       localePrefix: 'as-needed',
     });
     ```
   - Create `src/i18n/request.ts` (used by the Next.js plugin):
     ```ts
     import { getRequestConfig } from 'next-intl/server';
     import { routing } from './routing';
     export default getRequestConfig(async ({ requestLocale }) => {
       let locale = await requestLocale;
       if (!locale || !routing.locales.includes(locale as 'en' | 'hi')) {
         locale = routing.defaultLocale;
       }
       return {
         locale,
         messages: (await import(`../../messages/${locale}.json`)).default,
       };
     });
     ```
   - Update `src/middleware.ts` (or `src/proxy.ts` — whichever is the active middleware file):
     integrate next-intl's `createNavigation`/middleware so locale detection runs first; chain
     with any existing Sentry/auth middleware. Locale is detected from (in priority order):
     `NEXT_LOCALE` cookie → `Accept-Language` header → default `en`.
   - Export `{ Link, redirect, usePathname, useRouter }` from `src/i18n/navigation.ts`:
     ```ts
     import { createNavigation } from 'next-intl/navigation';
     import { routing } from './routing';
     export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
     ```
     Replace all existing `next/link` and `next/navigation` imports in locale-aware components
     with these wrappers so locale prefixing is automatic.

2. **Message files** (`messages/en.json` + `messages/hi.json`):

   Extract **every** user-facing UI string into namespaced JSON. Seller-entered content (listing
   titles, descriptions, usernames, review text) is **never** extracted — it renders as-is.
   Only UI chrome is translated. Minimum required namespaces and keys:

   - `Common`: `loading`, `error`, `save`, `cancel`, `confirm`, `delete`, `edit`, `back`,
     `next`, `submit`, `search`, `filter`, `clearFilters`, `viewAll`, `showMore`, `showLess`,
     `copyLink`, `copied`, `or`, `required`, `optional`, `yes`, `no`.
   - `Nav`: `home`, `browse`, `sell`, `howItWorks`, `login`, `register`, `logout`, `dashboard`,
     `myOrders`, `myListings`, `wallet`, `settings`, `profile`, `adminPanel`, `language`.
   - `Auth`: `loginTitle`, `loginSubtitle`, `emailLabel`, `passwordLabel`, `forgotPassword`,
     `loginButton`, `noAccount`, `registerLink`, `registerTitle`, `registerSubtitle`,
     `nameLabel`, `confirmPassword`, `registerButton`, `haveAccount`, `loginLink`,
     `verifyEmailTitle`, `verifyEmailSubtitle`, `resendEmail`, `turnstileError`.
   - `Home`: `heroTitle`, `heroSubtitle`, `heroCta`, `featuredListings`, `howItWorksTitle`,
     `step1Title`, `step1Desc`, `step2Title`, `step2Desc`, `step3Title`, `step3Desc`,
     `whyGetxTitle`, `trustBadge`, `speedBadge`, `supportBadge`.
   - `Listing`: `buyNow`, `addToCart`, `price`, `platform`, `game`, `category`, `condition`,
     `delivery`, `instant`, `manual`, `seller`, `reviews`, `noReviews`, `reportListing`,
     `shareLink`, `relatedListings`, `soldOut`, `outOfStock`, `stock`, `quantity`.
   - `Checkout`: `checkoutTitle`, `orderSummary`, `subtotal`, `platformFee`, `loyaltyDiscount`,
     `total`, `payWith`, `crypto`, `upi`, `placeOrder`, `processingPayment`, `awaitingPayment`,
     `paymentExpiry`, `termsNotice`, `loyaltyBalance`, `redeemPoints`, `maxRedeemNote`.
   - `Orders`: `myOrders`, `orderDetails`, `orderId`, `status`, `placedOn`, `updatedOn`,
     `seller`, `buyer`, `viewDetails`, `trackOrder`, `disputeOrder`, `confirmReceipt`,
     `confirmReceiptWarning`, `leaveReview`, `orderTimeline`, `deliveryProof`,
     `autoReleaseNotice`, `statusLabels` (object with all OrderStatus values translated).
   - `Seller`: `sellerDashboard`, `myListings`, `createListing`, `editListing`, `deleteListing`,
     `listingTitle`, `listingDescription`, `listingPrice`, `listingCategory`, `listingGame`,
     `listingStock`, `listingDelivery`, `publishListing`, `draftListing`, `pendingOrders`,
     `deliverOrder`, `deliveryNote`, `markDelivered`, `earningsThisMonth`, `totalSales`,
     `kycStatus`, `kycPending`, `kycApproved`, `kycRejected`, `completeKyc`.
   - `Dashboard`: `walletBalance`, `availableBalance`, `heldBalance`, `deposit`, `withdraw`,
     `transactionHistory`, `loyaltyPoints`, `referralLink`, `pendingReferrals`, `noTransactions`.
   - `Review`: `reviewTitle`, `ratingLabel`, `commentLabel`, `submitReview`, `reviewPosted`,
     `sellerRating`, `reviewsCount`.
   - `Errors`: `notFound`, `unauthorized`, `serverError`, `listingUnavailable`, `orderNotFound`,
     `paymentFailed`, `tryAgain`.
   - `Footer`: `about`, `terms`, `privacy`, `contact`, `copyright`.

   **Hindi translations must be accurate and natural** — use proper Devanagari script.
   Do NOT use placeholder strings like `"[Hindi for X]"`. Examples of expected quality:
   - `buyNow`: `"अभी खरीदें"` (not `"BUY NOW"`), `loginButton`: `"लॉग इन करें"`,
     `checkoutTitle`: `"चेकआउट"`, `orderSummary`: `"ऑर्डर सारांश"`,
     `total`: `"कुल"`, `search`: `"खोजें"`, `language`: `"भाषा"`.
   - `statusLabels` in Hindi: `PENDING`: `"लंबित"`, `AWAITING_PAYMENT`: `"भुगतान की प्रतीक्षा"`,
     `PAID`: `"भुगतान हुआ"`, `IN_PROGRESS`: `"प्रगति में"`, `DELIVERED`: `"डिलीवर हुआ"`,
     `COMPLETED`: `"पूर्ण"`, `DISPUTED`: `"विवादित"`, `CANCELLED`: `"रद्द"`,
     `REFUNDED`: `"वापस"`.

3. **Root layout + server components** (`src/app/[locale]/layout.tsx`):

   - Wrap the existing root layout in the next-intl `[locale]` dynamic segment:
     move `src/app/layout.tsx` → `src/app/[locale]/layout.tsx`.
   - Inside the layout, wrap children with `<NextIntlClientProvider messages={messages} locale={locale}>`.
   - Retrieve `messages` via the `getMessages()` helper from `next-intl/server`.
   - Update the `<html lang={locale}>` attribute dynamically.
   - Existing page and layout files under `src/app/(marketing)`, `src/app/(shop)`,
     `src/app/(dashboard)`, `src/app/(auth)`, `src/app/admin` do **not** need to move — they
     remain under their route groups; only the root layout wraps them.
   - In every **Server Component** that renders translatable strings, call:
     ```ts
     import { getTranslations } from 'next-intl/server';
     const t = await getTranslations('Namespace');
     ```
   - In every **Client Component** (`'use client'`) that renders translatable strings, call:
     ```ts
     import { useTranslations } from 'next-intl';
     const t = useTranslations('Namespace');
     ```
   - Priority order for conversion: `site-header.tsx`, `user-menu.tsx`, `site-footer.tsx`,
     auth form pages, home page, listing card component, checkout page, order detail page,
     seller dashboard pages, buyer dashboard pages. Convert all of these fully — no raw English
     string literals left in JSX for any user-visible text.

4. **Language switcher component** (`src/components/layout/language-switcher.tsx`):

   - Desktop: a `<DropdownMenu>` (shadcn) in the header right-section showing the current locale
     flag + label. Options: `🇬🇧 English` / `🇮🇳 हिन्दी`.
   - Mobile: add the same options inside the existing hamburger / mobile nav drawer, below the
     main links, labelled with `t('Nav.language')`.
   - On select, navigate to the same path in the target locale using the `useRouter` + `usePathname`
     from `src/i18n/navigation.ts` (this handles the `/hi/` prefix automatically):
     ```ts
     router.replace(pathname, { locale: nextLocale });
     ```
   - After navigation, next-intl sets the `NEXT_LOCALE` cookie automatically (it's built-in for
     the App Router); no manual `document.cookie` needed.
   - The switcher should reflect the **active** locale (check mark or bold on the current option).
   - Integrate into `src/components/layout/site-header.tsx` (desktop) and the mobile nav component.
   - Use v10 design tokens: dark background, `#4d7cfe` highlight on hover/active, Poppins font,
     consistent with the existing header styling.

5. **SEO: hreflang tags** (`src/app/[locale]/layout.tsx` or a shared `<Head>` component):

   - For every page, emit `<link rel="alternate" hreflang="en" href="https://getx.live/[path]" />`
     and `<link rel="alternate" hreflang="hi" href="https://getx.live/hi/[path]" />` plus
     `<link rel="alternate" hreflang="x-default" href="https://getx.live/[path]" />`.
   - Use Next.js `generateMetadata` or the static `metadata.alternates.languages` object in the
     root layout to emit these. The `NEXT_PUBLIC_APP_URL` env var (already in `.env.example`)
     is the base URL.
   - Verify the tags render in the `<head>` of both locale variants in production build output.

6. **Locale-aware number + date formatting**:

   - Replace all raw `new Intl.NumberFormat(...)` / `toLocaleString()` calls with a shared util
     `src/lib/format.ts` (create if not present):
     ```ts
     export function formatCurrency(amountMinor: number, locale: string): string {
       return new Intl.NumberFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
         style: 'currency', currency: 'INR', maximumFractionDigits: 0,
       }).format(amountMinor / 100);
     }
     export function formatDate(date: Date | string, locale: string): string {
       return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
         day: 'numeric', month: 'short', year: 'numeric',
       }).format(new Date(date));
     }
     ```
   - In Server Components, get the locale from `await getLocale()` (next-intl/server).
   - In Client Components, get it from `useLocale()` (next-intl).
   - Apply `formatCurrency` everywhere a price is displayed (listing cards, checkout, order detail,
     wallet page, seller dashboard earnings). Apply `formatDate` on all `createdAt` / `updatedOn`
     displays in orders, reviews, transaction history.

7. **Seller content is never translated** — listing titles, descriptions, usernames, and review
   comments are stored as-is and rendered as-is regardless of locale. Add a comment in the code
   wherever seller content is rendered: `{/* seller-entered: not translated */}`. Do not pass
   these strings through `t()`.

8. **QA harness** (`scripts/qa-step23.ts`):

   Follow the existing convention: `npx tsx scripts/qa-step23.ts`, real HTTP requests against
   the dev server (`http://localhost:3000`), `ok()` / `threw()` helper functions, no external
   mocks, cleanup not needed (read-only).

   Implement the following checks:

   a. **Key parity**: parse `messages/en.json` and `messages/hi.json`; recursively collect all
      leaf key paths; assert that both files have **exactly the same set of keys** with no
      missing or extra keys. Print any mismatches.
   b. **No empty values**: assert that no key in either file maps to an empty string `""`.
   c. **English page renders without missing-key error**: `fetch('http://localhost:3000/')` →
      assert status 200; assert response body does not contain `MISSING_MESSAGE` (next-intl's
      error string).
   d. **Hindi page renders without missing-key error**: `fetch('http://localhost:3000/hi')` →
      assert status 200; assert response body does not contain `MISSING_MESSAGE`.
   e. **hreflang present**: `fetch('http://localhost:3000/')` → parse HTML; assert
      `<link rel="alternate" hreflang="hi"` is present in the response.
   f. **Hindi URL prefix**: `fetch('http://localhost:3000/hi')` → assert status 200 (not 404).
   g. **English clean URL**: `fetch('http://localhost:3000/en')` → assert it redirects (30x) to
      `/` (no `/en/` prefix for default locale).
   h. **Cookie persistence**: after simulating a locale switch (send `Cookie: NEXT_LOCALE=hi`
      to `fetch('http://localhost:3000/')`), assert response body is Hindi (check for a known
      Hindi string like `"अभी खरीदें"` or `"लॉग इन"`).
   i. **Listing page in both locales**: `fetch('.../listing/[any-slug]')` and
      `fetch('.../hi/listing/[any-slug]')` both return 200 (use a known test slug from DB or
      skip gracefully with a note if no listings exist).
   j. **formatCurrency locale**: call `formatCurrency(10000, 'hi')` and assert it contains `₹`
      and `100`; call `formatCurrency(10000, 'en')` and assert the same.

   Print a summary line: `QA STEP 23: X/10 passed` and exit with code 1 on any failure.

9. **Edge cases**:

   - A user navigating directly to `/en/some-page` should be redirected to `/some-page` (no
     double prefix). Implement via middleware redirect if next-intl does not handle it.
   - If `messages/hi.json` fails to load (e.g., file deleted), the app must not crash — next-intl
     will throw; add a try/catch in `request.ts` fallback to `en` messages.
   - Missing key at runtime: configure next-intl with `onError` + `getMessageFallback` in
     `request.ts` to fall back to the key path string and log a Sentry warning (use
     `Sentry.captureMessage` if `NEXT_PUBLIC_SENTRY_DSN` is set, otherwise `console.warn`).
     Never let a missing key crash the page.
   - The language switcher must preserve query params and hash when switching locale
     (e.g., `/?game=pokemon-go` → `/hi/?game=pokemon-go`). Use `useSearchParams` + manual
     reconstruction if `router.replace` does not carry them automatically.
   - Right-to-left (RTL) layout is **not** required for Hindi (Hindi is LTR). Do not add RTL
     CSS — it would break the existing design for future Arabic support; leave that to a
     dedicated RTL step.
   - Static pages exported via `generateStaticParams` (if any game or category pages use it)
     must also export both locales. Add `locale` to the params object in `generateStaticParams`.
   - The `scripts/qa-step23.ts` harness requires the dev server to be running; add a note in the
     script's top comment and check connectivity at startup (one `fetch` with a timeout; exit
     early with a clear message if the server is not up).

### Rules

- **Seller-entered content (titles, descriptions, review text, usernames) is NEVER passed
  through `t()` or translated.** Only UI chrome strings belong in `messages/*.json`.
- **Both locale files must have identical key structures** before the step is considered done.
  No placeholder strings, no empty values, no English strings left in the Hindi file.
- The default locale (`en`) must use **clean URLs without prefix** (`/listing/x`, not
  `/en/listing/x`). The `/en/` prefix must redirect to `/`. SEO cannot have duplicate content
  on both `/` and `/en/`.
- All locale switching and cookie persistence must go through next-intl's built-in mechanisms —
  do not manually manipulate `document.cookie` or `window.location` for locale changes.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST

- [ ] `npm install next-intl` succeeded; no peer-dependency conflicts with Next.js 16
- [ ] `messages/en.json` and `messages/hi.json` exist; all namespaces present; key sets are identical
- [ ] No empty string values in either message file; all Hindi strings are real Devanagari text
- [ ] `http://localhost:3000/` renders in English with no `MISSING_MESSAGE` errors
- [ ] `http://localhost:3000/hi` renders in Hindi with no `MISSING_MESSAGE` errors
- [ ] Navigating to `/en/some-page` redirects to `/some-page` (no double prefix)
- [ ] Language switcher visible in desktop header (dropdown) and mobile nav drawer
- [ ] Switching to Hindi navigates to `/hi/…`, sets `NEXT_LOCALE=hi` cookie, and page renders in Hindi
- [ ] Switching back to English navigates to `/…` (no prefix), page renders in English
- [ ] Cookie persistence: refreshing page after locale switch keeps the selected language
- [ ] Query params preserved on locale switch (e.g., `/?game=pokemon-go` → `/hi/?game=pokemon-go`)
- [ ] `<link rel="alternate" hreflang="hi">` and `<link rel="alternate" hreflang="x-default">` present in `<head>`
- [ ] `<html lang="hi">` on Hindi pages, `<html lang="en">` on English pages
- [ ] `formatCurrency(10000, 'hi')` returns `₹100`; `formatDate` returns a locale-appropriate string for both locales
- [ ] Listing cards, checkout page, order detail page all show translated labels in Hindi
- [ ] Seller-entered listing title and description render as-is (not translated) in both locales
- [ ] Missing-key fallback: deleting one key from `messages/hi.json` temporarily logs a warning and renders the key path — does not crash the page
- [ ] `scripts/qa-step23.ts` passes all 10 checks (run via `npx tsx scripts/qa-step23.ts`)
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive (switcher works on 375 px viewport)
- [ ] Step 23 ticked in `docs/ROADMAP.md`; key choices logged in `docs/DECISIONS.md`
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Move to **Step 24 — PWA** (Progressive Web App: `next-pwa` / service worker, Web App Manifest,
offline fallback page, install prompt, push notification groundwork for order/chat alerts).

## 🔑 Tokens needed: **None**
