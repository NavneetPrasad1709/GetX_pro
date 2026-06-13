# GETX — COLOR SYSTEM REDESIGN

> Goal: keep GETX's **premium dark base**, but fix the owner's real complaint — "relies too heavily on a
> single flat dark theme → feels flat, less trustworthy, weak visual hierarchy." This is not a recolor.
> It adds **depth (an elevation ladder), a disciplined small palette, structural trust color, and CTA
> hierarchy** — while preserving existing token names so components don't all break at once.
>
> Grounded in the real `src/app/globals.css` (Brand v10) + the color/UI audit findings.
> Implements **Phase 7** of `MARKETPLACE_IMPROVEMENT_MASTER_PLAN.md`.

---

## 1. Why the current system feels flat (root cause)

The v10 palette is *clean* but **one-dimensional**, and the audit confirmed every part of the owner's hunch:

| Problem | Evidence (real code) | Effect |
|---|---|---|
| **No elevation scale** | `--card #14161b`, `--secondary/--muted/--accent` all `#1b1e25` (`globals.css:87-91`); ~111 flat surfaces across 78 files; almost no shadow usage. | Cards, panels, dialogs, controls all sit on the same visual plane → no hierarchy, nothing "lifts". |
| **One overloaded accent** | `--primary #4d7cfe` drives CTAs (`cta-link.tsx:12`), status (`order-status-badge.tsx:16-17`), the Instant badge, PRO, links. | The eye can't tell "click me" from "this is a status" from "this is a link". |
| **Two conflicting trust-score color systems** | `lib/trust.ts` `trustTone()` (90/70 bands) vs `trust-score-pill.tsx:10-15` (off-token emerald/yellow/orange/red, 80/60/40 bands). | The *same* score renders different colors in different places. |
| **Weak trust/escrow tints** | escrow panel `bg-primary/8` (`escrow-protection-panel.tsx:71`); trust badges = tiny blue icons on 5% glass (`trust-badge.tsx:16-28`). | The platform's #1 selling point (safety) is visually faint. |
| **~25 off-token color literals in 13 files** | `SELLER_LEVELS` amber/slate/yellow/cyan; `admin/fraud/page.tsx:19` purple; `funnel-chart.tsx:21-27`. | Palette drift; "single accent" rule already broken inconsistently. |
| **Small CTAs** | `Button` default `h-8` / lg `h-9` (`button.tsx:24-29`). | CTAs don't command the buy moment; below 44px tap target. |
| **Two card systems** | `ui/card` `ring-1 rounded-xl` (`card.tsx:15`) vs page-level `border rounded-lg`. | Inconsistent surfaces reinforce the "templated/flat" feeling. |

**Benchmark:** Eldorado/G2G lean on bright, dense, high-contrast cards (sometimes garish). Modern SaaS
marketplaces (Stripe, Linear, Vercel, Polar) prove the winning move for a *premium* dark UI is **subtle
elevation + a restrained accent + one structural secondary color + generous whitespace** — not more colors.
GETX should look like the SaaS reference, not the G2G clutter.

---

## 2. The new palette

Design rule: **one primary (blue, action) · one structural secondary (green, trust/safety) · one warm
accent (amber, urgency/featured) · semantic status · a 4-step elevation ladder.** Everything else is text
and lines. Discipline beats variety.

### 2.1 Primary — Action (blue, kept)
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--primary` | `#4d7cfe` | accent text, icons, links, rings, tints | AA as text on dark (4.8–5.3:1) |
| `--primary-strong` | `#4169e8` | **solid CTA fills behind white text** | white on it = 4.76:1 ✓ |
| `--primary-hover` | `#5e89ff` | hover for text/icon accents | — |
| `--primary-strong-hover` | `#3a5fd9` | CTA hover (darkens, not lightens) | 5.5:1 ✓ |

### 2.2 Secondary — Trust / Safety (green, promoted to structural)
Green stops being just "success" and becomes the **safety language**: escrow, verified, money-back,
guarantee. This is what makes "safe" *read differently* from "marketplace".
| Token | Hex | Use | Notes |
|---|---|---|---|
| `--trust` / `--success` | `#45b483` | trust text/icons, success states, verified | AA as text on dark |
| `--trust-strong` | `#2e9e6e` | solid green fills | **use near-black text** (`#06140d`) for AA, not white |
| `--trust-bg` | `rgba(69,180,131,.12)` | escrow/guarantee panel fill | replaces faint `bg-primary/8` |
| `--trust-border` | `rgba(69,180,131,.30)` | escrow/guarantee panel border | makes safety panels *visible* |

### 2.3 Accent — Urgency / Featured / Promo (amber, sparing)
| Token | Hex | Use | Notes |
|---|---|---|---|
| `--warm` / `--warning` / `--star` | `#f0b429` | urgency ("Selling fast"), Promoted/Featured tag, ratings, low-stock | use **sparingly** — scarcity loses power if everywhere |
| `--warm-bg` | `rgba(240,180,41,.12)` | featured/urgency pill fill | — |
| `--warm-border` | `rgba(240,180,41,.30)` | featured/urgency pill border | — |

### 2.4 Semantic status (stops blue from doing double duty)
| Token | Hex | Use |
|---|---|---|
| `--info` | `#38bdf8` (cyan) | **informational** status badges (NEW, processing, "instant") — frees `--primary` for CTAs only |
| `--success` | `#45b483` | completed / paid / approved |
| `--warning` | `#f0b429` | pending / action-needed |
| `--danger` / `--destructive` | `#ff5a76` | failed / disputed / refunded / rejected |
| `--neutral` | `#9ca1ab` | cancelled / expired / draft |

### 2.5 Backgrounds — the elevation ladder (the depth fix)
| Token | Hex | Elevation | Use |
|---|---|---|---|
| `--surface-0` / `--background` | `#0a0b0d` | 0 (canvas) | page background |
| `--surface-1` / `--bg-2` | `#101218` | 1 | alternating section bands, sidebar, sunken wells |
| `--surface-2` / `--card` | `#16181f` | 2 | cards, panels (now lighter than canvas → they *lift*) |
| `--surface-3` / `--popover` | `#1d212a` | 3 | dialogs, dropdowns, sticky bars, tooltips (highest) |
| `--control` / `--secondary` | `#1f232c` | control | inputs, selects, secondary buttons, chips |

### 2.6 Cards, borders, shadows
| Token | Value | Use |
|---|---|---|
| `--card` | `#16181f` | one card surface (kill the ring-vs-border split) |
| `--border` | `rgba(255,255,255,.07)` | default hairline |
| `--border-strong` | `rgba(255,255,255,.12)` | emphasized dividers, focused cards |
| `--hairline-top` | `rgba(255,255,255,.05)` | **top-edge highlight** on cards (the key dark-UI depth trick) |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.4)` | resting cards |
| `--shadow-md` | `0 8px 24px -8px rgba(0,0,0,.55)` | hover-lift, popovers |
| `--shadow-lg` | `0 20px 48px -16px rgba(0,0,0,.65)` | dialogs, sticky buy bar |

### 2.7 Text scale (kept — already passes AA)
| Token | Hex | Contrast on `--card` | Use |
|---|---|---|---|
| `--foreground` | `#f3f4f6` | ~14:1 | headings, primary text |
| `--muted-foreground` | `#9ca1ab` | ~6.1:1 ✓ | body, labels |
| `--faint` | `#8a8f9a` | ~5.6:1 ✓ | meta, captions |

### 2.8 Seller-level tiers (replace off-token literals)
| Tier | Token | Hex |
|---|---|---|
| Bronze | `--tier-bronze` | `#c08457` |
| Silver | `--tier-silver` | `#aab2c0` |
| Gold | `--tier-gold` | `#f0b429` (= `--warning`) |
| Platinum | `--tier-platinum` | `#5ec4d8` |
| Elite | `--tier-elite` | `#4d7cfe` (= `--primary`, optionally with a subtle gradient sheen) |

### 2.9 Unified trust-score scale (single source of truth)
One helper in `src/lib/trust.ts` feeds the pill, the card, and the panel. Bands standardized to:
| Score | Token | Color |
|---|---|---|
| ≥ 80 | `--trust-high` | `#45b483` (green) |
| 60–79 | `--trust-mid` | `#4d7cfe` (blue) |
| 40–59 | `--trust-low` | `#f0b429` (amber) |
| < 40 | `--trust-critical` | `#ff5a76` (red) |

---

## 3. Before / After — token mapping

> Names preserved where possible → existing classes keep working; only the *values* shift + new tokens add.

| Token | BEFORE | AFTER | Why |
|---|---|---|---|
| `--background` | `#0a0b0d` | `#0a0b0d` (= surface-0) | canvas unchanged |
| `--bg-2` | `#0e0f12` | `#101218` (= surface-1) | clearer band separation for alternating sections |
| `--card` | `#14161b` | `#16181f` (= surface-2) | **lighter than canvas → cards lift** |
| `--popover` | `#14161b` | `#1d212a` (= surface-3) | overlays now read above cards |
| `--secondary` | `#1b1e25` | `#1f232c` (= control) | controls distinct from cards |
| `--muted` | `#1b1e25` | `#14161b` (sunken) | wells/tracks read *below* cards |
| `--accent` | `#1b1e25` | `#1f232c` | align with control fill |
| `--success` | `#45b483` | `#45b483` + tints (`--trust-bg/-border`) | make safety panels visible |
| `--primary` | `#4d7cfe` (CTA+status+links) | `#4d7cfe` (accent/links only) | offload status → `--info` |
| *(new)* `--info` | — | `#38bdf8` | informational status, frees blue |
| *(new)* `--surface-3`,`--control` | — | `#1d212a`, `#1f232c` | elevation ladder |
| *(new)* `--shadow-sm/md/lg`,`--hairline-top` | — | see §2.6 | depth |
| *(new)* `--tier-*`,`--trust-high/mid/low/critical` | scattered literals | tokens | kill off-palette drift |
| Button `default`/`lg` | `h-8`/`h-9` | `h-10`/`h-11` | command the click + 44px tap |
| Escrow panel | `bg-primary/8` | `bg-[--trust-bg] border-[--trust-border]` | safety reads green + visible |

---

## 4. Paste-ready `globals.css` additions

Drop into the `:root, .dark` block and `@theme inline` map in `src/app/globals.css` (keep existing entries;
add/override these):

```css
:root, .dark {
  /* --- elevation ladder (NEW depth) --- */
  --background: #0a0b0d;     /* surface-0 */
  --bg-2:       #101218;     /* surface-1: alt bands, sidebar */
  --card:       #16181f;     /* surface-2: raised cards */
  --popover:    #1d212a;     /* surface-3: dialogs/dropdowns */
  --secondary:  #1f232c;     /* control fills */
  --accent:     #1f232c;
  --muted:      #14161b;     /* sunken wells/tracks */

  /* explicit surface aliases for new code */
  --surface-0: #0a0b0d; --surface-1: #101218; --surface-2: #16181f;
  --surface-3: #1d212a; --control: #1f232c;

  /* borders + depth */
  --border:        rgba(255,255,255,.07);
  --border-strong: rgba(255,255,255,.12);
  --hairline-top:  rgba(255,255,255,.05);
  --shadow-sm: 0 1px 2px rgba(0,0,0,.4);
  --shadow-md: 0 8px 24px -8px rgba(0,0,0,.55);
  --shadow-lg: 0 20px 48px -16px rgba(0,0,0,.65);

  /* brand: blue = ACTION only */
  --primary: #4d7cfe; --primary-hover: #5e89ff;
  --primary-strong: #4169e8; --primary-strong-hover: #3a5fd9;
  --primary-foreground: #ffffff;

  /* trust = SAFETY language (green, structural) */
  --success: #45b483; --trust: #45b483; --trust-strong: #2e9e6e;
  --trust-bg: rgba(69,180,131,.12); --trust-border: rgba(69,180,131,.30);

  /* warm = URGENCY/FEATURED (sparing) */
  --warning: #f0b429; --star: #f0b429; --warm: #f0b429;
  --warm-bg: rgba(240,180,41,.12); --warm-border: rgba(240,180,41,.30);

  /* semantic status (blue no longer doubles as status) */
  --info: #38bdf8; --danger: #ff5a76; --destructive: #ff5a76; --neutral: #9ca1ab;

  /* seller tiers */
  --tier-bronze:#c08457; --tier-silver:#aab2c0; --tier-gold:#f0b429;
  --tier-platinum:#5ec4d8; --tier-elite:#4d7cfe;

  /* unified trust-score bands */
  --trust-high:#45b483; --trust-mid:#4d7cfe; --trust-low:#f0b429; --trust-critical:#ff5a76;
}
```

Map the new ones in `@theme inline` (e.g. `--color-info: var(--info); --color-trust: var(--trust);
--color-surface-2: var(--surface-2);` …) so Tailwind utilities like `bg-info`, `bg-trust`, `bg-surface-2`,
`shadow-[var(--shadow-md)]`, `border-trust-border` exist. Add a card utility:

```css
@layer utilities {
  .card-elevated {            /* one card system: surface-2 + top highlight + soft shadow */
    background: var(--surface-2);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm), inset 0 1px 0 var(--hairline-top);
  }
  .panel-trust {              /* visible escrow/guarantee panel */
    background: var(--trust-bg); border: 1px solid var(--trust-border);
  }
}
```

---

## 5. Component color rules (apply consistently)

- **CTA hierarchy:** *Primary action* = `bg-primary-strong` white text (`Buy now`, `Pay`, `Request payout`).
  *Secondary* = `bg-control` (`--secondary`) foreground text. *Ghost/tertiary* = transparent + hover `bg-muted`.
  *Destructive* = `bg-destructive/10 text-destructive`. **Never** use plain `--primary` as a solid CTA fill
  (fails AA behind white). One primary CTA per view band.
- **Trust/safety:** anything about escrow/verified/money-back/guarantee uses **green** (`--trust*`), not blue.
  Escrow + guarantee panels use `.panel-trust`.
- **Status badges:** drive every status from `statusTone(status)` → `--info` / `--success` / `--warning` /
  `--danger` / `--neutral`. Remove emerald/purple/amber literals.
- **Seller levels:** `tierTone(level)` → `--tier-*`. Badge ≥ `size="sm"` on cards (not `xs`).
- **Trust score:** `trustTone(score)` (one helper) → `--trust-high/mid/low/critical`, used identically by
  pill + card + panel.
- **Cards:** one `.card-elevated`. Dialogs/popovers on `--surface-3` + `--shadow-lg`.
- **Featured/Promoted:** `.panel`-style warm tint (`--warm-bg/-border`) so paid placement reads distinct.

---

## 6. Per-page redesign (before → after)

### 6.1 Homepage `/`
**Before:** great hero, then every band repeats the same recipe (`border-t border-border py-10`, `bg-card`
box, `bg-primary/12` icon) — `category-mega-grid.tsx:30`, `protection-steps.tsx:31`, `why-getx.tsx:36`,
`seller-cta.tsx:11`. No real products above the fold; flat, same-y rhythm.
**After:**
- **Alternate section backgrounds** `--surface-0` ↔ `--surface-1` so bands visibly separate (no more
  hairline-only dividers).
- **Escrow/protection band → green** (`.panel-trust` accents) so "safety" reads differently from the blue
  marketplace bands.
- **Insert the "Fresh listings" rail** (master-plan P1-T3) high on the page using `.card-elevated` product
  cards — breaks the all-text cadence with real product visuals.
- **Seller CTA** keeps its tinted gradient but now as one of several differentiated surfaces, not the lone
  exception.
- Stats/social-proof band (P2-T1) on `--surface-1` with green trust accents.

### 6.2 Search / Marketplace `/marketplace`
**Before:** functional faceted filters + grid, but filter panel, chips, and result cards all sit on the same
flat plane; active-filter chips and the sort control don't stand out.
**After:**
- Filter panel on `--surface-1` (a sunken "well"); result cards `.card-elevated` (surface-2) so the grid
  *floats* above the filters.
- Active-filter chips use `--info` tint (informational), "Clear all" uses `--primary` text.
- Promoted band gets a `--warm` "Promoted" label + warm hairline to separate paid from organic.
- Sticky sort/results bar on `--surface-3` + `--shadow-sm` when scrolled.

### 6.3 Product Listing grid (cards) — `listing-card.tsx`
**Before:** single flat card; trust score + PRO + Verified shown but seller **level** absent; `alt=""`; no
save control; image and meta on the same surface.
**After:**
- `.card-elevated` with top-edge highlight + hover `--shadow-md` lift (premium tactile feel).
- Add **wishlist heart** (top-right of cover) + **SellerLevelBadge `size="sm"`** with tier color
  (`tierTone`). Trust score uses unified `trustTone`.
- Price in `--foreground` bold; "Instant" badge moves to `--info` (cyan) — not blue.
- Honest scarcity pill ("1 of 1" / "Selling fast") in `--warm` when data justifies (P2-T5).

### 6.4 Product Detail `/listing/[slug]`
**Before:** strong layout, but the escrow panel is faint (`bg-primary/8`), the money-back guarantee is one of
four equal grey pills, and the seller-level badge is `size="xs"`.
**After:**
- **Escrow panel → `.panel-trust`** (green, visible) with a bold shield icon.
- **Money-Back Guarantee seal** (green, slightly larger) placed directly beside the `Buy now` CTA
  (master-plan P2-T2) — the most prominent trust element at the click.
- Buy box on `--surface-2` with `--shadow-md`; sticky mobile bar on `--surface-3` + `--shadow-lg`, anchored
  `bottom-0` (P1-T5).
- Seller trust panel: level badge `size="sm"` + top community badges + "Sold N · viewed N" social proof.
- `Buy now` uses the larger CTA (`h-11`) — commands the page.

### 6.5 Seller Profile `/sellers/[id]`
**Before:** badges render as a plain `★ name` pill; level not prominent; trust signals understated.
**After:**
- Header on `--surface-1` with the seller's **tier color** as an accent rail; level badge `size="lg"`.
- Trust score ring/pill via unified `trustTone`; community badges as proper tier-tinted chips.
- "Verified" + escrow + guaranteed-payout messaging in green; reviews feed cards `.card-elevated`.
- Fix incoming links to use `SellerProfile.id` (P1-T4) so the page is actually reachable.

### 6.6 Seller Dashboard `/seller`
**Before:** flat KPI cards; trust score is a bare "N/100" line; `LevelProgressPanel` exists but renders on
**zero** pages; off-token level colors.
**After:**
- KPI cards `.card-elevated` with subtle status-tinted left accents (green = wallet/available, amber =
  pending orders, blue = listings).
- **Render `LevelProgressPanel`** (P4-T1) with the tier color system + a green "X sales to GOLD" progress bar.
- Charts (Recharts) recolored to tokens: `--primary`, `--trust`, `--warm`, `--info` (replace
  `funnel-chart.tsx:21-27` literals).
- "In escrow" wallet card in green (`.panel-trust`); "available" emphasized as the actionable balance.

### 6.7 Buyer Dashboard `/dashboard`
**Before:** flat cards, low hierarchy, no recently-viewed/wishlist surfacing.
**After:**
- "Needs action" orders banner uses `--warning`; completed in `--success`.
- Add **wishlist** + **recently-viewed** rails (P3-T1/T2) as `.card-elevated` product strips.
- KYC/verify nudge uses green (safety) framing, not generic blue.
- Notification bell present in the topbar (P6-T1).

### 6.8 Checkout `/checkout`
**Before:** correct, but the order summary, escrow pre-frame, and trust badges all sit on the same flat dark
plane; the safety story doesn't pop at the highest-anxiety moment.
**After:**
- **Order summary panel** elevated (surface-2 + `--shadow-md`) — optionally an A/B with a single near-light
  "receipt" panel to make the money math read as the trustworthy focal point.
- **Escrow pre-frame + "held in escrow" line → green** (`.panel-trust`).
- **Money-Back Guarantee seal** beside the Pay button; trust badges promoted from a muted 3-across row to a
  green-accented strip.
- `Pay` CTA `h-11`, `bg-primary-strong`; loyalty toggle on `--control`.
- Collapse the full `EscrowProtectionPanel` on mobile to reduce cognitive load (keep the seal visible).

---

## 7. Implementation plan & guardrails

1. **Tokens first** (P7-T1): add the elevation ladder, shadows, trust/warm/info/tier tokens to `globals.css`.
   Pure additive + value shifts on names that already exist → low blast radius.
2. **Unify helpers** (P7-T2/T3): one `trustTone`, one `tierTone`, new `statusTone`; replace the ~25
   off-token literals in 13 files; add an **ESLint rule** banning raw hex / Tailwind color literals in
   `src/components` so drift can't return.
3. **One card system** (P7-T4): converge `ui/card` + page cards onto `.card-elevated`; adopt `ui/badge`
   variants for status pills.
4. **CTA + tap targets** (P7-T5): Button `h-10/h-11`, Input/Select `h-10`.
5. **Apply per-page** (§6) behind a visual-regression pass.

**Guardrails:**
- Keep the app **dark-first** — this adds *depth*, not a light theme (the near-light checkout receipt is an
  optional, scoped A/B only).
- **Re-verify WCAG AA** after every value change: white text only on `--primary-strong`/`--trust-strong`-dark
  pairings; never white on `--primary`/`--trust` (use dark text or use them as accents/tints).
- Ship behind screenshot diffs on home / PLP / PDP / checkout / seller / buyer dashboards.
- Single accent discipline stays: **blue = action, green = safety, amber = urgency/featured, cyan = info.**
  Four meanings, four colors — no more.

---

## 8. Expected outcome

| Before | After |
|---|---|
| Flat: every surface on one plane | 4-step elevation ladder → clear hierarchy, cards lift |
| Blue does action + status + links | Blue = action only; green = safety; amber = urgency; cyan = info |
| Trust panels faint (`primary/8`) | Trust = visible green panels + a bold guarantee seal at the click |
| Two trust-color systems, off-token tiers | One `trustTone`/`tierTone`/`statusTone`, all token-driven |
| Small CTAs (`h-8`) | Commanding CTAs (`h-11`) that own the buy moment |
| "Premium but flat, same-y" | Premium, layered, trustworthy — SaaS-grade, not G2G-clutter |

Net: a marketplace that **feels** as safe and well-built as it actually is — which, for a trust-first
platform, is the whole game.
```
