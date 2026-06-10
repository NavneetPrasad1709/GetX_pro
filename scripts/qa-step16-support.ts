/**
 * Step 16 QA — AI Support bot. Drives the REAL services/validators/prompt against the live dev DB,
 * in-process (the Anthropic key is absent in dev, so AI inference itself is degraded — every other
 * layer is exercised directly): system prompt facts, input validation, escalation detection,
 * server-side context injection, ticket create/idempotency, admin close + audit + idempotency,
 * the ADMIN gate on the close action, and AI-disabled graceful behaviour. Best-effort HTTP 503
 * smoke if a dev server is up. Cleans up everything it creates in finally.
 * Run: npx tsx scripts/qa-step16-support.ts
 *
 * NOTE: scripts/qa-step16.ts is a DIFFERENT suite (audit Prompt 16 = anti-fraud). This is the
 * roadmap Step 16 (AI Support) harness — kept separate, same as qa-step19-delivery.ts.
 */
import { db } from "../src/lib/db";
import { buildSystemPrompt } from "../src/lib/support-prompt";
import { isAiEnabled, streamSupportResponse } from "../src/lib/ai";
import { supportChatSchema, closeTicketSchema } from "../src/lib/validators/support";
import {
  getSupportContext,
  createSupportTicket,
  closeSupportTicket,
  detectEscalation,
  getSupportTicket,
  listSupportTickets,
  parseChatHistory,
} from "../src/server/services/support";
import { closeTicket } from "../src/server/actions/support";
import { createListing } from "../src/server/services/listings";
import { createOrder } from "../src/server/services/orders";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  const stamp = Date.now();
  const ticketIds: string[] = [];

  const buyer = await db.user.create({
    data: { email: `qa16s-b-${stamp}@test.getx.live`, name: "QA16 Buyer", emailVerified: new Date(), emailNotifications: false },
  });
  const noOrdersUser = await db.user.create({
    data: { email: `qa16s-n-${stamp}@test.getx.live`, name: "QA16 NoOrders", emailVerified: new Date(), emailNotifications: false },
  });
  const admin = await db.user.create({
    data: { email: `qa16s-a-${stamp}@test.getx.live`, name: "QA16 Admin", role: "ADMIN", emailVerified: new Date(), emailNotifications: false },
  });
  const sellerUser = await db.user.create({
    data: { email: `qa16s-s-${stamp}@test.getx.live`, name: "QA16 Seller", emailVerified: new Date(), emailNotifications: false },
  });
  const seller = await db.sellerProfile.create({
    data: { userId: sellerUser.id, displayName: "QA16 Store", kycStatus: "APPROVED" },
  });

  let listingId = "";
  let orderId = "";

  try {
    // ---------------------------------------------------------------------
    console.log("\n=== system prompt (hardcoded policy facts) ===");
    const base = buildSystemPrompt();
    ok("identifies as GETX Support AI", base.includes("GETX Support AI"));
    ok("explains escrow lifecycle", base.includes("AWAITING_PAYMENT") && base.includes("COMPLETED") && base.includes("DISPUTED"));
    ok("quotes buyer platform fee 5%", base.includes("5%"));
    ok("states dispute SLA (48 hours)", base.includes("48 hours"));
    ok("carries the escalation instruction", base.toLowerCase().includes("i don't know"));
    ok("instructs no emojis", base.toLowerCase().includes("do not use emojis"));
    ok("no context header when context omitted", !base.includes("This user's account context"));
    const withCtx = buildSystemPrompt("Order abc123 · status PAID");
    ok("context block appended when provided", withCtx.includes("This user's account context") && withCtx.includes("Order abc123"));

    // ---------------------------------------------------------------------
    console.log("\n=== input validation (Zod) ===");
    ok("rejects empty content", !supportChatSchema.safeParse({ messages: [{ role: "user", content: "" }] }).success);
    ok("rejects content > 500 chars", !supportChatSchema.safeParse({ messages: [{ role: "user", content: "x".repeat(501) }] }).success);
    ok("rejects empty messages array", !supportChatSchema.safeParse({ messages: [] }).success);
    ok(
      "rejects history > 20 turns",
      !supportChatSchema.safeParse({ messages: Array.from({ length: 21 }, () => ({ role: "user", content: "hi" })) }).success,
    );
    ok("accepts a valid 1-turn chat", supportChatSchema.safeParse({ messages: [{ role: "user", content: "where is my order?" }] }).success);
    ok("rejects unknown role", !supportChatSchema.safeParse({ messages: [{ role: "system", content: "hi" }] }).success);
    ok("closeTicketSchema accepts id + note", closeTicketSchema.safeParse({ ticketId: "abc123", note: "done" }).success);
    ok("closeTicketSchema rejects bad id", !closeTicketSchema.safeParse({ ticketId: "bad id!!", note: "" }).success);

    // ---------------------------------------------------------------------
    console.log("\n=== escalation detection (pure) ===");
    ok("user 'talk to a human' → escalate", detectEscalation("can I talk to a human?", "Sure, let me help."));
    ok("user 'real person' → escalate", detectEscalation("I want a real person", "ok"));
    ok("user 'escalate' → escalate", detectEscalation("please escalate this", "ok"));
    ok("AI 'I don't know' → escalate", detectEscalation("what is my refund status", "Hmm, I don't know the exact status."));
    ok("AI 'I'm unable' → escalate", detectEscalation("help", "I'm unable to access that."));
    ok("normal Q&A → no escalate", !detectEscalation("how does escrow work?", "Funds are held safely until you confirm delivery."));

    // ---------------------------------------------------------------------
    console.log("\n=== context injection (server-side) ===");
    const game = await db.game.findFirstOrThrow({ include: { categories: true } });
    const cat = game.categories[0];
    await createListing(
      { id: sellerUser.id, role: "SELLER" },
      { gameId: game.id, categoryId: cat.id, type: cat.kind, title: `QA16 Listing ${stamp}`, description: "Support QA listing.", price: 250000, stock: 5, deliveryType: "MANUAL", attributes: {}, images: [], publish: true },
    );
    const listing = await db.listing.findFirstOrThrow({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" } });
    listingId = listing.id;
    await db.listing.update({ where: { id: listing.id }, data: { slug: `qa16-listing-${stamp}` } });
    const order = await createOrder({ id: buyer.id, role: "BUYER" }, { listingSlug: `qa16-listing-${stamp}`, qty: 1 });
    orderId = order.id;
    await db.order.update({ where: { id: order.id }, data: { status: "PAID" } });

    const ctx = await getSupportContext(buyer.id);
    ok("context mentions the order id", ctx.includes(order.id), `ctx=${ctx.slice(0, 120)}`);
    ok("context mentions the order status", ctx.includes("PAID"));
    ok("context mentions the listing title", ctx.includes(`QA16 Listing ${stamp}`));
    const emptyCtx = await getSupportContext(noOrdersUser.id);
    ok("no-orders user → friendly empty context", emptyCtx === "This user has no orders yet.");
    let ctxThrew = false;
    try {
      await getSupportContext("nonexistent-user-id");
    } catch {
      ctxThrew = true;
    }
    ok("getSupportContext never throws on bad id", !ctxThrew);

    // ---------------------------------------------------------------------
    console.log("\n=== ticket creation + idempotency ===");
    const convo = [
      { role: "user" as const, content: `I need help with order ${order.id}` },
      { role: "assistant" as const, content: "I don't know — escalating." },
    ];
    const t1 = await createSupportTicket(buyer.id, convo);
    ticketIds.push(t1.id);
    ok("creates an OPEN ticket", t1.status === "OPEN");
    ok("subject derived from first user message (≤80)", t1.subject.length <= 80 && t1.subject.startsWith("I need help"));
    ok("chatHistory persisted as messages", parseChatHistory(t1.chatHistory).length === 2);

    const t2 = await createSupportTicket(buyer.id, convo);
    ok("idempotent: same userId+subject returns same ticket", t2.id === t1.id);
    const openCount = await db.supportTicket.count({ where: { userId: buyer.id, status: "OPEN", subject: t1.subject } });
    ok("idempotent: only ONE open ticket exists", openCount === 1, `count=${openCount}`);

    const guest = await createSupportTicket(null, [{ role: "user", content: "guest question about fees" }]);
    ticketIds.push(guest.id);
    ok("guest ticket created with userId null", guest.userId === null);

    const customSubj = await createSupportTicket(buyer.id, convo, "Custom subject");
    ticketIds.push(customSubj.id);
    ok("explicit subject overrides the derived one", customSubj.subject === "Custom subject" && customSubj.id !== t1.id);

    const detail = await getSupportTicket(t1.id);
    ok("getSupportTicket returns parsed transcript", detail?.messages.length === 2 && detail.messages[0].role === "user");

    // ---------------------------------------------------------------------
    console.log("\n=== admin close + audit + idempotency ===");
    await closeSupportTicket(admin.id, t1.id, "Resolved via QA.");
    const closed = await db.supportTicket.findUniqueOrThrow({ where: { id: t1.id } });
    ok("ticket status → CLOSED", closed.status === "CLOSED");
    ok("admin note saved", closed.adminNote === "Resolved via QA.");
    const audit1 = await db.auditLog.count({ where: { action: "CLOSE_SUPPORT_TICKET", entityId: t1.id } });
    ok("AuditLog CLOSE_SUPPORT_TICKET written", audit1 === 1);

    await closeSupportTicket(admin.id, t1.id, "second attempt");
    const audit2 = await db.auditLog.count({ where: { action: "CLOSE_SUPPORT_TICKET", entityId: t1.id } });
    ok("idempotent: re-closing writes NO duplicate audit", audit2 === 1, `audit=${audit2}`);

    // ---------------------------------------------------------------------
    console.log("\n=== admin gate on close action (non-admin blocked) ===");
    // No request/session in this script → auth() yields no admin. The OPEN guest ticket must stay OPEN.
    let blocked = false;
    try {
      const res = await closeTicket({ ticketId: guest.id, note: "should not work" });
      blocked = res.ok === false;
    } catch {
      blocked = true; // auth() throwing outside a request also counts as "did not close"
    }
    const guestStill = await db.supportTicket.findUniqueOrThrow({ where: { id: guest.id } });
    ok("closeTicket action denies non-admin", blocked);
    ok("guest ticket remains OPEN (gate held)", guestStill.status === "OPEN");
    const guestAudit = await db.auditLog.count({ where: { action: "CLOSE_SUPPORT_TICKET", entityId: guest.id } });
    ok("no audit row written for blocked close", guestAudit === 0);

    // ---------------------------------------------------------------------
    console.log("\n=== admin list filters ===");
    const openList = await listSupportTickets({ status: "OPEN", limit: 200 });
    ok("OPEN filter includes the guest ticket", openList.some((t) => t.id === guest.id));
    ok("OPEN filter excludes the closed ticket", !openList.some((t) => t.id === t1.id));
    const closedList = await listSupportTickets({ status: "CLOSED", limit: 200 });
    ok("CLOSED filter includes the closed ticket", closedList.some((t) => t.id === t1.id));

    // ---------------------------------------------------------------------
    console.log("\n=== AI-disabled graceful behaviour ===");
    ok("isAiEnabled() false when no ANTHROPIC_API_KEY", isAiEnabled() === false);
    const deltas: string[] = [];
    for await (const d of streamSupportResponse([{ role: "user", content: "hi" }], "system")) deltas.push(d);
    ok("streamSupportResponse yields nothing when AI disabled", deltas.length === 0);

    // ---------------------------------------------------------------------
    console.log("\n=== route 503 smoke (best-effort HTTP) ===");
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch("http://localhost:3000/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      ok("disabled route returns 503 (key absent)", res.status === 503, `status=${res.status}`);
    } catch {
      console.log("  • skipped: dev server not reachable on :3000 (run `npm run dev` to exercise the route)");
    }
  } finally {
    // Cleanup — scoped strictly to this run's rows.
    await db.auditLog.deleteMany({ where: { action: "CLOSE_SUPPORT_TICKET", entityId: { in: ticketIds } } });
    await db.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
    if (orderId) await db.order.deleteMany({ where: { id: orderId } });
    if (listingId) await db.listing.deleteMany({ where: { id: listingId } });
    await db.sellerProfile.deleteMany({ where: { id: seller.id } });
    await db.user.deleteMany({ where: { id: { in: [buyer.id, noOrdersUser.id, admin.id, sellerUser.id] } } });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 16 QA — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
