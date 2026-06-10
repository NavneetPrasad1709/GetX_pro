"use server";

import { revalidatePath } from "next/cache";
import { captureException } from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { closeTicketSchema } from "@/lib/validators/support";
import { closeSupportTicket, SupportServiceError } from "@/server/services/support";

/**
 * Admin support actions (Step 16). ADMIN-gated here; the service writes the AuditLog
 * and enforces idempotency. The AI bot files tickets automatically — only humans close them.
 */

export type SupportActionResult = { ok: true } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await auth();
  return session?.user?.id && session.user.role === "ADMIN"
    ? { id: session.user.id }
    : null;
}

export async function closeTicket(raw: unknown): Promise<SupportActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Forbidden." };
  if (!rateLimit(`admin:${admin.id}`, { limit: 120, windowMs: 60_000 }).ok) {
    return { ok: false, error: "Too many requests." };
  }

  const parsed = closeTicketSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    await closeSupportTicket(admin.id, parsed.data.ticketId, parsed.data.note);
    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${parsed.data.ticketId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof SupportServiceError) return { ok: false, error: err.message };
    captureException(err);
    console.error("[closeTicket]", err);
    return { ok: false, error: GENERIC };
  }
}
