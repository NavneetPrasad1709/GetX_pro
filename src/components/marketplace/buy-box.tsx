"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MinusIcon,
  PlusIcon,
  ZapIcon,
  PackageIcon,
  ShoppingCartIcon,
  MessageCircleIcon,
  LockIcon,
} from "lucide-react";
import type { DeliveryType } from "@prisma/client";
import { computeBuyerFee } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Price } from "@/components/shared/price";
import { CtaLink } from "@/components/shared/cta-link";

type Props = {
  slug: string;
  priceMinor: number;
  currency: string;
  stock: number;
  deliveryType: DeliveryType;
};

// A sane per-order quantity ceiling on top of available stock.
const MAX_QTY = 99;

/**
 * Buy box (Step 07) — quantity, a live fee/total preview (lib/fees.ts, the same
 * math checkout uses in Step 08), and the primary "Buy now" CTA. Client island
 * for the quantity interactivity; the total recomputes locally. "Buy now" wires
 * to checkout (Step 08); "Chat" wires to seller chat (Step 11).
 */
export function BuyBox({ slug, priceMinor, currency, stock, deliveryType }: Props) {
  const inStock = stock > 0;
  const maxQty = Math.min(stock, MAX_QTY);
  const [qty, setQty] = useState(1);

  const clampedQty = Math.min(Math.max(1, qty), Math.max(1, maxQty));
  const { subtotalMinor, platformFeeMinor, totalMinor, platformFeePercent } =
    computeBuyerFee(priceMinor, clampedQty);

  const instant = deliveryType === "INSTANT";
  const checkoutHref = `/checkout?listing=${encodeURIComponent(slug)}&qty=${clampedQty}`;

  return (
    <>
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 min-[761px]:p-5">
      {/* unit price + delivery */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Price amountMinor={priceMinor} currency={currency} size="xl" />
          <p className="mt-0.5 text-xs text-faint">per item</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            instant
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {instant ? (
            <ZapIcon className="size-3.5" aria-hidden="true" />
          ) : (
            <PackageIcon className="size-3.5" aria-hidden="true" />
          )}
          {instant ? "Instant delivery" : "Manual delivery"}
        </span>
      </div>

      {/* stock / quantity */}
      {inStock ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {stock > 1 ? `${stock} in stock` : "1 available"}
          </span>
          {maxQty > 1 ? (
            <div
              className="flex items-center gap-1 rounded-lg border border-input p-1"
              role="group"
              aria-label="Quantity"
            >
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={clampedQty <= 1}
                aria-label="Decrease quantity"
                className="grid size-11 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none min-[521px]:size-9"
              >
                <MinusIcon className="size-4" aria-hidden="true" />
              </button>
              <span
                className="w-8 text-center font-heading text-sm font-semibold tabular-nums"
                aria-live="polite"
              >
                {clampedQty}
              </span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                disabled={clampedQty >= maxQty}
                aria-label="Increase quantity"
                className="grid size-11 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none min-[521px]:size-9"
              >
                <PlusIcon className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
          Out of stock
        </span>
      )}

      {/* fee preview */}
      <dl className="flex flex-col gap-1.5 border-t border-border pt-4 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">
            Subtotal{clampedQty > 1 ? ` (${clampedQty} ×)` : ""}
          </dt>
          <dd className="tabular-nums">{formatMoney(subtotalMinor, currency)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">
            Platform fee ({platformFeePercent}%)
          </dt>
          <dd className="tabular-nums">
            {formatMoney(platformFeeMinor, currency)}
          </dd>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
          <dt className="font-semibold">Total</dt>
          <dd>
            <Price amountMinor={totalMinor} currency={currency} size="lg" />
          </dd>
        </div>
        <p className="text-xs text-faint">
          Payment processing included — what you see is what you pay.
        </p>
      </dl>

      {/* CTAs */}
      <div className="flex flex-col gap-2.5">
        {inStock ? (
          <CtaLink href={checkoutHref} size="lg" className="w-full">
            <ShoppingCartIcon className="size-[18px]" aria-hidden="true" />
            Buy now
          </CtaLink>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-sm bg-muted px-[26px] py-3.5 font-heading text-base font-bold text-muted-foreground"
          >
            <ShoppingCartIcon className="size-[18px]" aria-hidden="true" />
            Out of stock
          </button>
        )}

        <Link
          href={`/chat/new?listing=${encodeURIComponent(slug)}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-border bg-background px-[26px] py-3 font-heading text-[14.5px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <MessageCircleIcon className="size-[18px]" aria-hidden="true" />
          Chat with seller
        </Link>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <LockIcon className="size-3.5 text-primary" aria-hidden="true" />
        Payment held in escrow until you confirm delivery
      </p>
    </div>

      {/* Sticky mobile buy bar — app-like persistent CTA, shares qty/total with
          the box above. Sits just above the fixed mobile bottom-nav (74px) and
          is hidden on desktop where the sidebar box is always in view. */}
      <div className="fixed inset-x-0 bottom-[74px] z-40 border-t border-border bg-card/95 backdrop-blur-md min-[901px]:hidden">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-[22px] py-2.5">
          <div className="min-w-0">
            <div className="font-heading text-lg leading-tight font-bold tabular-nums">
              {formatMoney(totalMinor, currency)}
            </div>
            <div className="text-[11px] text-faint">
              {clampedQty > 1 ? `${clampedQty} × · ` : ""}incl. {platformFeePercent}% fee
            </div>
          </div>
          {inStock ? (
            <CtaLink href={checkoutHref} className="shrink-0 px-7 py-3">
              <ShoppingCartIcon className="size-[17px]" aria-hidden="true" />
              Buy now
            </CtaLink>
          ) : (
            <span className="shrink-0 rounded-sm bg-muted px-6 py-3 font-heading text-sm font-bold text-muted-foreground">
              Out of stock
            </span>
          )}
        </div>
      </div>
    </>
  );
}
