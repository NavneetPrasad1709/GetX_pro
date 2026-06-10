import { NotificationType, type Notification } from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";
import { formatMoney } from "@/lib/money";
import { getResend, RESEND_FROM_EMAIL } from "@/lib/resend";
import {
  pushNotificationToSocket,
  type SocketNotificationPayload,
} from "@/lib/socket-notify";
import type { EmailMessage } from "@/lib/email-templates/layout";
import { orderUpdateEmail } from "@/lib/email-templates/order-update";
import { newMessageEmail } from "@/lib/email-templates/new-message";
import { disputeUpdateEmail } from "@/lib/email-templates/dispute-update";
import { payoutUpdateEmail } from "@/lib/email-templates/payout-update";
import { newReviewEmail } from "@/lib/email-templates/new-review";
import { systemEmail } from "@/lib/email-templates/system";

/**
 * Notification service (Step 22) — SERVER-SIDE ONLY.
 *
 * The marketplace's nervous system: every lifecycle event (payment, delivery,
 * dispute, payout, message, review, KYC) writes an in-app `Notification` row,
 * pushes a realtime `notification:new` socket event, and (optionally) sends an
 * email via Resend.
 *
 * HARD INVARIANT: nothing here ever throws or blocks the caller. All trigger
 * helpers (`notify*`) are designed to be invoked fire-and-forget AFTER a money /
 * order transaction has already committed:
 *
 *     void notifyOrderEvent(orderId, "DELIVERED").catch(captureException);
 *
 * A notification failure must NEVER roll back or surface from the originating
 * mutation. Every DB / email / socket error is swallowed and reported to Sentry.
 */

const { feedPageSize } = siteConfig.notifications;
const MAX_LIMIT = 50;

// --- serialization ----------------------------------------------------------

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string; // ISO
};

function toRow(n: Notification): NotificationRow {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

function toSocketPayload(n: Notification): SocketNotificationPayload {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Only allow internal relative paths — blocks open-redirects via the bell. */
function safeLink(link: string | null | undefined): string | null {
  if (!link) return null;
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  return link.slice(0, 512);
}

// --- core primitives (never throw) ------------------------------------------

/**
 * Write an in-app notification row and push a realtime socket event.
 * Returns the row, or `null` on any error (never throws).
 */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}): Promise<Notification | null> {
  try {
    const row = await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: clamp(input.title, 80),
        body: clamp(input.body, 200),
        link: safeLink(input.link),
      },
    });
    // Best-effort realtime push (fail-open inside).
    void pushNotificationToSocket(input.userId, toSocketPayload(row));
    return row;
  } catch (err) {
    captureException(err);
    return null;
  }
}

/**
 * Send a notification email — honoring the user's `emailNotifications` preference
 * (read from the DB, never trusting a caller flag) and gracefully no-opping when
 * Resend is not configured. Never throws.
 */
export async function sendNotificationEmail(
  userId: string,
  message: EmailMessage,
): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, emailNotifications: true },
    });
    if (!user?.email) return;
    if (!user.emailNotifications) return; // opted out — skip silently
    const resend = getResend();
    if (!resend) {
      console.warn(
        "[notifications] RESEND_API_KEY not set — email skipped (in-app notification still delivered)",
      );
      return;
    }
    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: user.email,
      subject: message.subject,
      html: message.html,
    });
  } catch (err) {
    captureException(err);
  }
}

/** Create the in-app row (+ socket) and, if given, the email — all best-effort. */
async function deliver(
  userId: string,
  content: {
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
    email?: EmailMessage;
  },
): Promise<void> {
  await createNotification({
    userId,
    type: content.type,
    title: content.title,
    body: content.body,
    link: content.link,
  });
  if (content.email) await sendNotificationEmail(userId, content.email);
}

// --- read side (used by the bell + actions) ---------------------------------

export async function getNotifications(
  userId: string,
  limit: number = feedPageSize,
): Promise<NotificationRow[]> {
  const take = Math.min(Math.max(1, limit), MAX_LIMIT);
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(toRow);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, read: false } });
}

/** Mark one notification read. Ownership is enforced by the `userId` in WHERE. */
export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<void> {
  await db.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true, readAt: new Date() },
  });
}

/** Mark all of a user's unread notifications read. Returns how many changed. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const res = await db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });
  return res.count;
}

export async function getEmailPreference(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { emailNotifications: true },
  });
  return user?.emailNotifications ?? true;
}

export async function updateEmailPreference(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { emailNotifications: enabled },
  });
}

// --- trigger helpers (self-resolving, fire-and-forget) ----------------------

export type OrderEvent = "PAID" | "DELIVERED" | "COMPLETED" | "REFUNDED";

/**
 * Notify the right audience about an order lifecycle change. Resolves buyer /
 * seller / listing itself from `orderId` so callers add just one line post-commit.
 */
export async function notifyOrderEvent(
  orderId: string,
  event: OrderEvent,
): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        buyerId: true,
        seller: { select: { userId: true } },
        listing: { select: { title: true } },
      },
    });
    if (!order) return;

    const title = order.listing.title;
    const buyerLink = `/orders/${orderId}`;
    const sellerUserId = order.seller.userId;

    switch (event) {
      case "PAID": {
        await deliver(sellerUserId, {
          type: NotificationType.ORDER_UPDATE,
          title: "New paid order",
          body: `"${title}" is paid — deliver it now to keep buyers happy.`,
          link: buyerLink,
          email: orderUpdateEmail({
            statusLabel: "paid",
            listingTitle: title,
            body: `Your buyer paid for "${title}". Deliver it now — fast delivery means better reviews.`,
            link: buyerLink,
          }),
        });
        await deliver(order.buyerId, {
          type: NotificationType.ORDER_UPDATE,
          title: "Payment confirmed",
          body: `Your payment for "${title}" is safe in escrow.`,
          link: buyerLink,
          email: orderUpdateEmail({
            statusLabel: "confirmed",
            listingTitle: title,
            body: `Your payment is locked in escrow. The seller will deliver shortly — we'll let you know.`,
            link: buyerLink,
          }),
        });
        break;
      }
      case "DELIVERED": {
        await deliver(order.buyerId, {
          type: NotificationType.ORDER_UPDATE,
          title: "Order delivered",
          body: `"${title}" was delivered — confirm to release payment.`,
          link: buyerLink,
          email: orderUpdateEmail({
            statusLabel: "delivered",
            listingTitle: title,
            body: `Check everything is as described, then confirm receipt to release payment — or open a dispute if something's wrong.`,
            link: buyerLink,
          }),
        });
        break;
      }
      case "COMPLETED": {
        await deliver(order.buyerId, {
          type: NotificationType.ORDER_UPDATE,
          title: "Order completed",
          body: `Your order "${title}" is complete. Leave a review!`,
          link: buyerLink,
          email: orderUpdateEmail({
            statusLabel: "completed",
            listingTitle: title,
            body: `Your order is complete. A quick review helps other buyers and rewards your seller.`,
            link: buyerLink,
          }),
        });
        await deliver(sellerUserId, {
          type: NotificationType.ORDER_UPDATE,
          title: "Sale completed",
          body: `Funds for "${title}" were released to your wallet.`,
          link: "/seller/wallet",
          email: orderUpdateEmail({
            statusLabel: "completed",
            listingTitle: title,
            body: `The escrow for "${title}" was released to your wallet balance. Nice work!`,
            link: "/seller/wallet",
          }),
        });
        break;
      }
      case "REFUNDED": {
        await deliver(order.buyerId, {
          type: NotificationType.ORDER_UPDATE,
          title: "Order refunded",
          body: `Your order "${title}" was refunded.`,
          link: buyerLink,
          email: orderUpdateEmail({
            statusLabel: "refunded",
            listingTitle: title,
            body: `Your order "${title}" was refunded. The amount is returned per our refund policy.`,
            link: buyerLink,
          }),
        });
        break;
      }
    }
  } catch (err) {
    captureException(err);
  }
}

export type DisputeEvent = "OPENED" | "RESOLVED_BUYER" | "RESOLVED_SELLER";

export async function notifyDisputeEvent(
  orderId: string,
  event: DisputeEvent,
): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        buyerId: true,
        seller: { select: { userId: true } },
        listing: { select: { title: true } },
      },
    });
    if (!order) return;

    const title = order.listing.title;
    const link = `/orders/${orderId}`;
    const sellerUserId = order.seller.userId;

    if (event === "OPENED") {
      await deliver(sellerUserId, {
        type: NotificationType.DISPUTE,
        title: "Dispute opened",
        body: `A buyer opened a dispute on "${title}". Respond now.`,
        link,
        email: disputeUpdateEmail({
          headline: "A dispute was opened on your order",
          body: `A buyer opened a dispute on "${title}". Please respond with your side and any proof so our team can resolve it fast.`,
          link,
        }),
      });
      // Alert admins (in-app only — avoid email noise on the ops team).
      const admins = await db.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      await Promise.all(
        admins.map((a) =>
          createNotification({
            userId: a.id,
            type: NotificationType.SYSTEM,
            title: "New dispute",
            body: `Dispute opened on order ${orderId.slice(0, 8)} ("${title}").`,
            link: "/admin",
          }),
        ),
      );
      return;
    }

    const buyerInFavor = event === "RESOLVED_BUYER";
    await deliver(order.buyerId, {
      type: NotificationType.DISPUTE,
      title: "Dispute resolved",
      body: buyerInFavor
        ? `Your dispute on "${title}" was resolved in your favor — refunded.`
        : `Your dispute on "${title}" was resolved — funds released to the seller.`,
      link,
      email: disputeUpdateEmail({
        headline: "Your dispute was resolved",
        body: buyerInFavor
          ? `The dispute on "${title}" was resolved in your favor and you've been refunded.`
          : `The dispute on "${title}" was reviewed and resolved — the funds were released to the seller.`,
        link,
      }),
    });
    await deliver(sellerUserId, {
      type: NotificationType.DISPUTE,
      title: "Dispute resolved",
      body: buyerInFavor
        ? `The dispute on "${title}" was resolved — the buyer was refunded.`
        : `The dispute on "${title}" was resolved in your favor.`,
      link,
      email: disputeUpdateEmail({
        headline: "A dispute was resolved",
        body: buyerInFavor
          ? `The dispute on "${title}" was resolved and the buyer was refunded.`
          : `The dispute on "${title}" was resolved in your favor — funds are on the way to your wallet.`,
        link,
      }),
    });
  } catch (err) {
    captureException(err);
  }
}

/** New chat message → notify the RECIPIENT only (never the sender). */
export async function notifyNewMessage(
  recipientUserId: string,
  senderName: string,
  conversationId: string,
): Promise<void> {
  try {
    const link = `/messages/${conversationId}`;
    await deliver(recipientUserId, {
      type: NotificationType.NEW_MESSAGE,
      title: "New message",
      body: `${senderName} sent you a message.`,
      link,
      email: newMessageEmail({ senderName, link }),
    });
  } catch (err) {
    captureException(err);
  }
}

export type PayoutEvent = "PAID" | "FAILED";

export async function notifyPayoutEvent(
  payoutId: string,
  event: PayoutEvent,
): Promise<void> {
  try {
    const payout = await db.payout.findUnique({
      where: { id: payoutId },
      select: {
        amountMinor: true,
        wallet: {
          select: {
            currency: true,
            sellerProfile: { select: { userId: true } },
          },
        },
      },
    });
    const sellerUserId = payout?.wallet.sellerProfile?.userId;
    if (!payout || !sellerUserId) return;

    const amount = formatMoney(payout.amountMinor, payout.wallet.currency);
    const link = "/seller/wallet";

    if (event === "PAID") {
      await deliver(sellerUserId, {
        type: NotificationType.PAYOUT,
        title: "Payout sent",
        body: `Your payout of ${amount} was sent.`,
        link,
        email: payoutUpdateEmail({
          statusLabel: "sent",
          amountFormatted: amount,
          body: `Your payout of ${amount} has been sent. It may take a short while to appear in your account.`,
          link,
        }),
      });
    } else {
      await deliver(sellerUserId, {
        type: NotificationType.PAYOUT,
        title: "Payout failed",
        body: `Your payout of ${amount} failed — amount returned to your balance.`,
        link,
        email: payoutUpdateEmail({
          statusLabel: "failed",
          amountFormatted: amount,
          body: `Your payout of ${amount} failed and was returned to your wallet balance. Please check your payout details and try again.`,
          link,
        }),
      });
    }
  } catch (err) {
    captureException(err);
  }
}

export async function notifyNewReview(input: {
  sellerUserId: string;
  listingTitle: string;
  rating: number;
  orderId: string;
}): Promise<void> {
  try {
    const link = `/orders/${input.orderId}`;
    await deliver(input.sellerUserId, {
      type: NotificationType.REVIEW,
      title: `New ${input.rating}-star review`,
      body: `You got a ${input.rating}-star review on "${input.listingTitle}".`,
      link,
      email: newReviewEmail({
        rating: input.rating,
        listingTitle: input.listingTitle,
        link,
      }),
    });
  } catch (err) {
    captureException(err);
  }
}

export async function notifyKycDecision(
  sellerUserId: string,
  decision: "APPROVE" | "REJECT",
): Promise<void> {
  try {
    if (decision === "APPROVE") {
      await deliver(sellerUserId, {
        type: NotificationType.SYSTEM,
        title: "Identity verified",
        body: `Your identity verification was approved — you're verified!`,
        link: "/seller",
        email: systemEmail({
          title: "You're verified",
          body: `Your identity verification was approved. The verified badge now shows on your seller profile — buyers trust verified sellers more.`,
          link: "/seller",
        }),
      });
    } else {
      await deliver(sellerUserId, {
        type: NotificationType.SYSTEM,
        title: "Verification needs another look",
        body: `Your verification was rejected. Please review and resubmit.`,
        link: "/seller/verify",
        email: systemEmail({
          title: "Verification needs another look",
          body: `Your identity verification was rejected. Please double-check your documents and resubmit from your seller dashboard.`,
          link: "/seller/verify",
        }),
      });
    }
  } catch (err) {
    captureException(err);
  }
}
