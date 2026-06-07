# GETX — Buyer Journey Report

> Acting as a real buyer spending real money. Build: Step 07/36. Verified from code.

## The journey, step by step

| Step | Status | Experience / blocker | Severity |
|---|---|---|---|
| **Homepage** | ✅ Works | Loads fast, clear value prop, search front-and-center. *But* hero shows **fake stats** (4.9/12,400+/₹2Cr+) → erodes trust once noticed. | 🟠 High (trust) |
| **Search** | ✅ Works | Header GET form → `/marketplace?game=&q=`; debounced filter bar; results persist in URL (shareable). | — |
| **Category browse** | ✅ Works | `/games/[slug]/[category]` (SEO pages) + marketplace `?type=` facet. Clean. | — |
| **Product page** | ✅ Works | Gallery (monogram fallback — **no real images** till Step 12), price, delivery type, full description, attributes, stock, JSON-LD, out-of-stock state. Strong. | 🟡 Med (no images) |
| **Seller profile** | ❌ Missing | Trust panel shows the seller but is **not clickable** — no storefront to vet them or see other listings. Trust dead-end. | 🟠 High |
| **Add to cart** | ❌ Missing | No cart — single-item buy only. | 🟡 Med |
| **Checkout** | ❌ **404** | "Buy now" → `/checkout?listing=&qty=` → route doesn't exist. **The journey ends here.** | 🔴 Critical |
| **Payment** | ❌ Missing | No gateway. | 🔴 Critical |
| **Order creation** | ❌ Missing | No order is ever created. | 🔴 Critical |
| **Delivery** | ❌ Missing | "Chat with seller" → `/chat/new` → 404. No delivery channel. | 🔴 Critical |
| **Confirm / escrow release** | ❌ Missing | Escrow is UI copy only. | 🔴 Critical |
| **My orders / history** | ❌ Missing | Buyer dashboard has no orders list. | 🟠 High |

## Trust & conversion blockers (as a buyer)
1. 🔴 I **cannot complete a purchase** — the single most important thing a buyer does. Hard stop.
2. 🟠 The hero's impressive numbers feel fabricated (no reviews/escrow exist to back them) → "is this real?"
3. 🟠 I can't click into a seller to judge them — trust panel is a dead-end.
4. 🟡 Listings have **no photos** — for game accounts/items, buyers want proof screenshots.
5. 🟡 No "similar listings" / "more from seller" → I leave instead of browsing more.
6. 🟢 No wishlist/favourites → nothing pulls me back.

## What's genuinely good for buyers
Fast server-rendered browse, clean filters, honest empty/out-of-stock states, escrow/money-back
*messaging*, mobile-friendly layout, accessible controls.

## Buyer verdict: **42/100.** A delightful window-shopping experience attached to a checkout that
doesn't exist. Until Steps 08–11 ship, no buyer can transact.
