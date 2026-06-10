import {
  CheckIcon,
  ShieldAlertIcon,
  InfoIcon,
  XCircleIcon,
} from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * Visual escrow lifecycle (Prompt 13) — Payment → Held → Delivered → Confirmed.
 * Pure SERVER component: all data is props (the live countdown stays in
 * ConfirmReceipt). Read-only — renders no action buttons.
 *
 * Source of truth for the labels is the escrow state machine
 * (src/server/services/escrow.ts). Terminal side-paths (DISPUTED / REFUNDED /
 * CANCELLED / EXPIRED) render a single alert card, not the numbered steps.
 */

type StepDef = {
  id: string;
  label: string;
  buyerDesc: string;
  sellerDesc: string;
  statuses: OrderStatus[];
};

const STEPS: StepDef[] = [
  {
    id: "payment",
    label: "Payment",
    buyerDesc: "Your payment is locked in escrow — the seller can't access it yet.",
    sellerDesc: "Waiting for the buyer's payment to clear.",
    statuses: ["AWAITING_PAYMENT", "UNDERPAID"],
  },
  {
    id: "escrow",
    label: "Held in escrow",
    buyerDesc: "GETX holds your funds safely. The seller is notified to deliver.",
    sellerDesc:
      "Funds are held in escrow. Deliver the order to start the release timer.",
    statuses: ["PAID"],
  },
  {
    id: "delivered",
    label: "Delivered",
    buyerDesc: "The seller has delivered. Review and confirm — or open a dispute.",
    sellerDesc: "Delivered! Waiting for the buyer to confirm receipt.",
    statuses: ["DELIVERED"],
  },
  {
    id: "confirmed",
    label: "Confirmed",
    buyerDesc: "Payment released to the seller. Thank you for trading on GETX!",
    sellerDesc:
      "Payment released to your wallet. Thank you for selling on GETX!",
    statuses: ["COMPLETED"],
  },
];

type AlertCopy = { icon: typeof ShieldAlertIcon; tone: string; title: string; body: string };

const ALERTS: Partial<Record<OrderStatus, AlertCopy>> = {
  DISPUTED: {
    icon: ShieldAlertIcon,
    tone: "border-destructive/30 bg-destructive/5 text-destructive",
    title: "Dispute under review",
    body: "The payment is frozen while our team reviews this order. You're protected until it's resolved.",
  },
  REFUNDED: {
    icon: InfoIcon,
    tone: "border-primary/30 bg-primary/5 text-primary",
    title: "Order refunded",
    body: "This order was refunded — the money was returned to the buyer. Nothing more to do here.",
  },
  CANCELLED: {
    icon: XCircleIcon,
    tone: "border-border bg-muted/40 text-muted-foreground",
    title: "Order cancelled",
    body: "This order was cancelled before payment. No money changed hands.",
  },
  EXPIRED: {
    icon: XCircleIcon,
    tone: "border-border bg-muted/40 text-muted-foreground",
    title: "Order expired",
    body: "Payment wasn't completed in time, so this order expired. You can start a new one anytime.",
  },
};

export type EscrowStepperProps = {
  status: OrderStatus;
  viewer: "buyer" | "seller";
  /** Formatted auto-release deadline (set once DELIVERED+). */
  deadlineLabel?: string;
  /** Pre-formatted order total (e.g. "₹1,050") — copy on COMPLETED. */
  formattedTotal?: string;
  className?: string;
};

function resolveStepState(status: OrderStatus): {
  currentStepIndex: number | null;
  isAlert: boolean;
} {
  const idx = STEPS.findIndex((s) => s.statuses.includes(status));
  if (idx === -1) return { currentStepIndex: null, isAlert: true };
  return { currentStepIndex: idx, isAlert: false };
}

export function EscrowStepper({
  status,
  viewer,
  deadlineLabel,
  formattedTotal,
  className,
}: EscrowStepperProps) {
  const { currentStepIndex, isAlert } = resolveStepState(status);

  // Side-path states: single alert card, not the 4-step progression.
  if (isAlert || currentStepIndex === null) {
    const alert = ALERTS[status];
    if (!alert) return null;
    const Icon = alert.icon;
    return (
      <div
        className={cn("rounded-lg border p-4", alert.tone, className)}
        role="status"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {alert.title}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{alert.body}</p>
      </div>
    );
  }

  return (
    <ol
      aria-label="Order progress"
      className={cn(
        "flex flex-col gap-0 rounded-lg border border-border bg-card/50 p-4 min-[761px]:flex-row min-[761px]:gap-0 min-[761px]:p-5",
        className,
      )}
    >
      {STEPS.map((step, i) => {
        const state =
          i < currentStepIndex
            ? "past"
            : i === currentStepIndex
              ? "current"
              : "future";
        const isLast = i === STEPS.length - 1;
        const desc = viewer === "buyer" ? step.buyerDesc : step.sellerDesc;

        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className="flex flex-1 gap-3 min-[761px]:flex-col min-[761px]:gap-0"
          >
            {/* node + connector */}
            <div className="flex flex-col items-center min-[761px]:flex-row min-[761px]:w-full">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold",
                  state === "past" && "border-success bg-success/20 text-success",
                  state === "current" &&
                    "border-primary bg-primary/20 text-primary",
                  state === "future" &&
                    "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                {state === "past" ? (
                  <CheckIcon className="size-4" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </span>
              {/* connector line */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    // vertical on mobile (in the gap beside stacked content),
                    // horizontal on desktop between nodes
                    "my-1 h-6 w-0.5 min-[761px]:my-0 min-[761px]:mx-2 min-[761px]:h-0.5 min-[761px]:flex-1",
                    state === "past" ? "bg-success" : "bg-border",
                  )}
                />
              )}
            </div>

            {/* label + description (description only on the current step) */}
            <div className="pb-4 min-[761px]:pt-2.5 min-[761px]:pr-4 min-[761px]:pb-0">
              <p
                className={cn(
                  "text-sm font-semibold",
                  state === "current" ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
                {state === "past" && (
                  <span className="sr-only"> (completed)</span>
                )}
              </p>
              {state === "current" && (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {step.id === "confirmed" && formattedTotal
                    ? viewer === "seller"
                      ? `${formattedTotal} released to your wallet. Thank you for selling on GETX!`
                      : desc
                    : desc}
                </p>
              )}
              {/* auto-release note on the delivered step */}
              {state === "current" &&
                step.id === "delivered" &&
                deadlineLabel &&
                (viewer === "buyer" ? (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    If you don&apos;t confirm or dispute by{" "}
                    <span className="font-semibold text-foreground">
                      {deadlineLabel}
                    </span>
                    , the payment auto-releases to the seller. You are always
                    protected until that deadline.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    Payment auto-releases to your wallet on{" "}
                    <span className="font-semibold text-foreground">
                      {deadlineLabel}
                    </span>{" "}
                    if the buyer takes no action before then.
                  </p>
                ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
