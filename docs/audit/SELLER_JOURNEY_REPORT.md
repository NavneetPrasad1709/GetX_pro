# GETX — Seller Journey Report

> Acting as a real seller trying to earn income. Build: Step 07/36. Verified from code.

## The journey, step by step

| Step | Status | Experience / blocker | Severity |
|---|---|---|---|
| **Register** | ✅ Works | Email/password + OAuth (gated), Turnstile, email verification (hashed tokens). Solid. | — |
| **Become a seller** | ✅ Works | `becomeSeller` is idempotent (race-safe), requires verified email, sets displayName/bio/country + terms, creates a wallet. Clean ≤1-min flow. | — |
| **KYC** | ❌ Missing | `SellerProfile.kycStatus` exists but there is **no submission UI / upload** — sellers can't actually verify. Admin review is Step 15. | 🟠 High |
| **Profile setup** | 🟡 Partial | Name/bio/country captured at onboarding, but **no profile-edit page** and **no avatar upload** (R2 = Step 12). | 🟡 Med |
| **Create listing** | ✅ Works | Strong form: one Zod schema, dynamic per-type attributes, type derived server-side from category, price string→minor units, draft/publish, a11y (aria-describedby, error summary, beforeunload guard). | — |
| **Edit listing** | ✅ Works | Ownership re-checked in-tx; state-machine guarded (DRAFT→ACTIVE↔PAUSED→REMOVED); slug stable. | — |
| **Images on listing** | ❌ Missing | No upload — every listing shows a monogram placeholder (R2 = Step 12). Hurts sales. | 🟠 High |
| **Manage orders** | ❌ Missing | No orders exist; seller hub has stats but **no order queue**. | 🔴 Critical |
| **Deliver order** | ❌ Missing | No delivery flow + no chat (Step 11). | 🔴 Critical |
| **Receive payment / wallet** | 🟡 Schema-only | Wallet + ledger-derived balance display exist; **no payout/withdrawal** (Step 14). Balance is always 0 (no sales). | 🔴 Critical |
| **Handle disputes** | ❌ Missing | No dispute flow (Step 15). | 🔴 Critical |
| **Notifications** | ❌ Missing | No email/in-app notifications (Step 22) — a seller wouldn't even know an order arrived. | 🟠 High |

## Seller friction / findings
1. 🔴 A seller can list but **cannot earn** — no orders, no delivery, no payout. The value proposition is unfulfilled.
2. 🟠 **No KYC submission** — yet payouts must be KYC-gated; this whole path is missing.
3. 🟠 **No images** makes listings look unfinished and lowers buyer trust/conversion.
4. 🟠 **No order notifications** — even once orders exist, a seller must be told.
5. 🟡 No profile-edit page / public storefront to build a brand.
6. 🟢 Seller hub stats are good (active/draft counts, ledger balance, trust) — a solid base for the future "CEO dashboard" (Step 20).

## What's genuinely good for sellers
The onboarding + listing lifecycle is **production-grade**: idempotent, ownership-safe, state-machine
correct, validated client+server, accessible. This is the strongest part of the platform.

## Seller verdict: **48/100.** Best-in-class *listing management*, but a seller's actual goal —
getting paid — is entirely unbuilt (Steps 09–15).
