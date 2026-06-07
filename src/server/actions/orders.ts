"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createOrderSchema } from "@/lib/validators/order";
import { createOrder, OrderServiceError } from "@/server/services/orders";

/**
 * Order server actions (Step 08). Like every mutation:
 *   1. auth() — logged in?
 *   2. rate limit — per JWT-verified userId only (guardrails §7)
 *   3. Zod re-validation — the client sends only slug + qty (+ provider),
 *      NEVER a price/total; the service recomputes all money from the DB.
 *   4. service call — order business logic lives in server/services/orders.
 */

export type CreateOrderResult = { ok: boolean; error?: string; orderId?: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

export async function createOrderAction(
  raw: unknown,
): Promise<CreateOrderResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Please log in to place an order." };
  }
  const user = { id: session.user.id, role: session.user.role };

  // Per-user write limit (userId only — never the attacker-controlled IP).
  const rl = rateLimit(`order-create:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };
  }

  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const order = await createOrder(user, parsed.data);
    revalidatePath("/orders");
    return { ok: true, orderId: order.id };
  } catch (err) {
    if (err instanceof OrderServiceError) return { ok: false, error: err.message };
    console.error("[createOrderAction]", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
