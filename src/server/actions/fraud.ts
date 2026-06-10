"use server";

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";

/**
 * Admin fraud-queue actions (Prompt 16). Every action re-checks ADMIN
 * server-side, runs in one transaction, and writes an AuditLog. Dismissing a
 * CRITICAL flag requires a substantive note (no lazy dismissals).
 */

export type FraudActionResult = { ok: true } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await auth();
  return session?.user?.id && session.user.role === "ADMIN"
    ? { id: session.user.id }
    : null;
}

function limited(adminId: string): boolean {
  return !rateLimit(`admin:${adminId}`, { limit: 120, windowMs: 60_000 }).ok;
}

const id = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i, "Invalid id");

const dismissSchema = z.object({
  flagId: id,
  note: z.string().trim().max(500).optional(),
});

const actionSchema = z.object({
  flagId: id,
  action: z.enum(["BAN_USER", "REMOVE_LISTING", "HOLD_PAYOUT", "FORCE_RE_KYC"]),
  note: z.string().trim().min(1, "Add a short note").max(500),
});

/**
 * Dismiss a flag (false positive). Releases auto-actions that this flag applied
 * IF no other OPEN HIGH/CRITICAL flag remains for the same target.
 */
export async function dismissFraudFlag(raw: unknown): Promise<FraudActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = dismissSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { flagId, note } = parsed.data;

  try {
    const flag = await db.fraudFlag.findUnique({ where: { id: flagId } });
    if (!flag) return { ok: false, error: "Flag not found." };
    if (flag.severity === "CRITICAL" && (note?.trim().length ?? 0) < 20) {
      return {
        ok: false,
        error: "Dismissing a CRITICAL flag needs a note of at least 20 characters.",
      };
    }

    await db.$transaction(async (tx) => {
      await tx.fraudFlag.update({
        where: { id: flagId },
        data: { status: "DISMISSED", reviewedBy: admin.id, reviewNote: note },
      });

      // Release auto-actions only if no OTHER active HIGH/CRITICAL flag remains.
      const otherSevere = await tx.fraudFlag.findFirst({
        where: {
          targetId: flag.targetId,
          id: { not: flagId },
          status: { in: ["OPEN", "REVIEWING"] },
          severity: { in: ["HIGH", "CRITICAL"] },
        },
        select: { id: true },
      });
      if (otherSevere) return;

      if (flag.autoAction === "HOLD_PAYOUT") {
        // targetId = seller's User.id → release that seller's hold.
        const sp = await tx.sellerProfile.findUnique({
          where: { userId: flag.targetId },
          select: { id: true },
        });
        if (sp) {
          await tx.sellerProfile.update({
            where: { id: sp.id },
            data: { payoutHeldAt: null },
          });
          await tx.user.update({
            where: { id: flag.targetId },
            data: { payoutHeld: false },
          });
        }
      } else if (flag.autoAction === "FREEZE_LISTING") {
        // targetId = listingId → reactivate if still paused.
        await tx.listing.updateMany({
          where: { id: flag.targetId, status: "PAUSED" },
          data: { status: "ACTIVE" },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "FRAUD_FLAG_DISMISSED",
          entity: "FraudFlag",
          entityId: flagId,
          meta: { reason: flag.reason, note: note ?? null },
        },
      });
    });

    revalidatePath("/admin/fraud");
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    console.error("[dismissFraudFlag]", err);
    return { ok: false, error: GENERIC };
  }
}

/** Confirm a flag and apply an escalation action. */
export async function actionFraudFlag(raw: unknown): Promise<FraudActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (limited(admin.id)) return { ok: false, error: "Too many requests." };

  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { flagId, action, note } = parsed.data;

  try {
    const flag = await db.fraudFlag.findUnique({ where: { id: flagId } });
    if (!flag) return { ok: false, error: "Flag not found." };

    await db.$transaction(async (tx) => {
      switch (action) {
        case "BAN_USER":
          await tx.user.update({
            where: { id: flag.targetId },
            data: { bannedAt: new Date() },
          });
          break;
        case "REMOVE_LISTING":
          await tx.listing.update({
            where: { id: flag.targetId },
            data: { status: "REMOVED", isFeatured: false, boostExpiresAt: null },
          });
          break;
        case "HOLD_PAYOUT": {
          const sp = await tx.sellerProfile.findUnique({
            where: { userId: flag.targetId },
            select: { id: true },
          });
          if (sp) {
            await tx.sellerProfile.update({
              where: { id: sp.id },
              data: { payoutHeldAt: new Date() },
            });
            await tx.user.update({
              where: { id: flag.targetId },
              data: { payoutHeld: true },
            });
          }
          break;
        }
        case "FORCE_RE_KYC": {
          const sp = await tx.sellerProfile.findUnique({
            where: { userId: flag.targetId },
            select: { id: true },
          });
          if (sp) {
            await tx.kycSubmission.deleteMany({ where: { sellerId: sp.id } });
            await tx.sellerProfile.update({
              where: { id: sp.id },
              data: { kycStatus: "NONE" },
            });
          }
          break;
        }
      }

      await tx.fraudFlag.update({
        where: { id: flagId },
        data: { status: "ACTIONED", reviewedBy: admin.id, reviewNote: note },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "FRAUD_FLAG_ACTIONED",
          entity: "FraudFlag",
          entityId: flagId,
          meta: { appliedAction: action, reason: flag.reason, note },
        },
      });
    });

    revalidatePath("/admin/fraud");
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    console.error("[actionFraudFlag]", err);
    return { ok: false, error: GENERIC };
  }
}
