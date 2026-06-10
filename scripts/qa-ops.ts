/**
 * Prompt 24 QA — operations work-queue. Tests ticket lifecycle, idempotent creation,
 * SLA deadline computation, first-response stamping, the prioritized queue, ops metrics,
 * and the idempotent SLA-breach escalation sweep. Cleans up in finally.
 * Run: npx tsx scripts/qa-ops.ts
 */
import { db } from "../src/lib/db";
import { siteConfig } from "../src/config/site";
import {
  computeSlaDeadline,
  createTicket,
  assignTicket,
  addNote,
  closeTicket,
  listOpenTickets,
  getOpsMetrics,
  sweepSlaBreaches,
} from "../src/server/services/work-queue";

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
  const ent = (suffix: string) => `qaops-${stamp}-${suffix}`;
  const agent = await db.user.create({ data: { email: `qaops-agent-${stamp}@test.getx.live`, name: "QA Ops Agent", role: "ADMIN", emailVerified: new Date(), emailNotifications: false } });

  try {
    console.log("\n=== SLA deadline + create (idempotent) ===");
    const base = new Date("2026-01-01T00:00:00Z");
    const dl = computeSlaDeadline("DISPUTE", base);
    ok("computeSlaDeadline = createdAt + slaHours", dl.getTime() === base.getTime() + siteConfig.ops.slaHours.DISPUTE * 3600_000);

    const t1 = await createTicket({ type: "DISPUTE", priority: "NORMAL", entityType: "Order", entityId: ent("d1"), title: "Dispute one", createdById: agent.id });
    ok("createTicket → OPEN status", t1.status === "OPEN");
    ok("createTicket sets slaDeadlineAt in the future", t1.slaDeadlineAt.getTime() > Date.now());
    const t1again = await createTicket({ type: "DISPUTE", priority: "HIGH", entityType: "Order", entityId: ent("d1"), title: "dup", createdById: agent.id });
    ok("createTicket idempotent for same entity (returns existing)", t1again.id === t1.id);
    ok("idempotent create did NOT change priority", t1again.priority === "NORMAL");

    console.log("\n=== assign + note (first-response) ===");
    await assignTicket(agent.id, t1.id, agent.id);
    const t1a = await db.workTicket.findUniqueOrThrow({ where: { id: t1.id } });
    ok("assignTicket sets assignee", t1a.assignedToId === agent.id);
    ok("assignTicket OPEN → IN_PROGRESS", t1a.status === "IN_PROGRESS");
    ok("assignTicket sets firstResponseAt", t1a.firstResponseAt !== null);
    const firstResp = t1a.firstResponseAt;
    await addNote(agent.id, t1.id, "Looking into this.");
    const t1b = await db.workTicket.findUniqueOrThrow({ where: { id: t1.id } });
    ok("addNote does not move firstResponseAt once set", t1b.firstResponseAt?.getTime() === firstResp?.getTime());
    ok("note row created", (await db.ticketNote.count({ where: { ticketId: t1.id } })) === 1);

    console.log("\n=== prioritized queue ===");
    await createTicket({ type: "FRAUD_FLAG", priority: "CRITICAL", entityType: "FraudFlag", entityId: ent("f1"), title: "Critical fraud" });
    await createTicket({ type: "KYC", priority: "LOW", entityType: "KycSubmission", entityId: ent("k1"), title: "Low kyc" });
    const queue = await listOpenTickets({ limit: 50 });
    const mine = queue.filter((q) => q.entityId.startsWith(`qaops-${stamp}`));
    ok("listOpenTickets returns our open tickets", mine.length >= 3);
    ok("CRITICAL sorts before NORMAL/LOW", mine[0].priority === "CRITICAL");
    ok("rows carry slaBreached boolean", typeof mine[0].slaBreached === "boolean");

    console.log("\n=== ops metrics ===");
    const m = await getOpsMetrics();
    ok("metrics has all queueDepth types", ["DISPUTE", "KYC", "FRAUD_FLAG", "PAYOUT_REVIEW", "SUPPORT"].every((t) => t in m.queueDepth));
    ok("slaAttainmentPct within 0-100", m.slaAttainmentPct >= 0 && m.slaAttainmentPct <= 100);
    ok("autoResolutionPct within 0-100", m.autoResolutionPct >= 0 && m.autoResolutionPct <= 100);
    ok("highPriorityOpen >= 1 (our CRITICAL)", m.highPriorityOpen >= 1);
    ok("metrics fields all present", typeof m.medianResolutionHours === "number" && typeof m.breachedOpen === "number" && Array.isArray(m.agentLoad));

    console.log("\n=== SLA breach sweep (idempotent escalation) ===");
    const breachable = await createTicket({ type: "PAYOUT_REVIEW", priority: "NORMAL", entityType: "Payout", entityId: ent("p1"), title: "Late payout" });
    await db.workTicket.update({ where: { id: breachable.id }, data: { slaDeadlineAt: new Date(Date.now() - 3600_000) } });
    const sweep1 = await sweepSlaBreaches();
    ok("sweep escalated at least our breached ticket", sweep1.escalated >= 1);
    const escalated = await db.workTicket.findUniqueOrThrow({ where: { id: breachable.id } });
    ok("breached ticket escalated to CRITICAL", escalated.priority === "CRITICAL");
    ok("SLA_BREACHED audit-logged", (await db.auditLog.count({ where: { action: "SLA_BREACHED", entityId: breachable.id } })) === 1);
    const before2 = await db.auditLog.count({ where: { action: "SLA_BREACHED", entityId: breachable.id } });
    await sweepSlaBreaches();
    ok("sweep idempotent — CRITICAL ticket not re-escalated/logged", (await db.auditLog.count({ where: { action: "SLA_BREACHED", entityId: breachable.id } })) === before2);

    console.log("\n=== close ===");
    await closeTicket(agent.id, t1.id, "Refunded the buyer.");
    const closed = await db.workTicket.findUniqueOrThrow({ where: { id: t1.id } });
    ok("closeTicket → CLOSED + resolvedAt set", closed.status === "CLOSED" && closed.resolvedAt !== null);
    ok("close does not appear in open queue", !(await listOpenTickets({ limit: 50 })).some((q) => q.id === t1.id));

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } finally {
    const tickets = await db.workTicket.findMany({ where: { entityId: { startsWith: `qaops-${stamp}` } }, select: { id: true } });
    const ids = tickets.map((t) => t.id);
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { actorId: agent.id }] } });
    await db.ticketNote.deleteMany({ where: { ticketId: { in: ids } } });
    await db.workTicket.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: agent.id } });
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
