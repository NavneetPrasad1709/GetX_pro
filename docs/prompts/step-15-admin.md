# STEP 15 — Admin Panel + Manual KYC + Manual Disputes (MVP complete)

> Goal: The control room. Admin manages users/listings/orders, reviews KYC, and resolves disputes
> (release or refund via ledger). This closes the MVP loop → ready to seed sellers + launch.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior QA Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1, §4, §7). Work in `D:\GetX`. This is **Step 15 — Admin + KYC + disputes**.
Talk Hinglish. Follow the full workflow. (This is the last MVP step.)

### Task
1. **Admin shell** (`/admin`, ADMIN role only): dashboard with key stats (users, sellers, GMV,
   open disputes, pending KYC, payouts to action). Clean, fast, role-gated + audit-logged.
2. **Users + sellers**: list/search, view detail, suspend/ban, adjust role. Every admin action →
   `AuditLog`.
3. **Listings + orders**: list/search/filter; remove abusive listings; view any order + its ledger/timeline.
4. **KYC review**: queue of `PENDING` `KycSubmission`s; admin views the doc via **short-lived signed
   R2 URL** (private), approves/rejects → updates `SellerProfile.kycStatus` + audit log.
5. **Dispute resolution**: queue of `OPEN` disputes; admin sees order, chat, delivery proof; decides
   `RESOLVED_BUYER` (refund via escrow.refund) or `RESOLVED_SELLER` (release via escrow.confirm).
   All money via ledger in a transaction. (AI Dispute Judge automates this later — Step 25.)
6. **Payout actioning**: if using manual payouts (Step 14), admin marks payouts PAID/FAILED here.
7. **Edge cases**: non-admin blocked everywhere, can't resolve an already-resolved dispute, can't
   ban self, signed KYC URLs expire, all actions idempotent + audited.

### Rules
- ADMIN-only, ownership/role checked on every action. Every mutation writes an AuditLog.
- Money decisions via escrow/ledger services in transactions. KYC docs via private signed URLs only.

### Report back
CLAUDE.md output format + QA CHECKLIST below. Also include a short **MVP end-to-end test report**.

---

## ✅ QA CHECKLIST
- [ ] Admin area is ADMIN-only (buyer/seller blocked — test)
- [ ] KYC: view (signed URL) → approve/reject updates seller status; URL expires
- [ ] Dispute: refund path and release path both move money correctly via ledger
- [ ] Listing/user moderation works; every admin action audit-logged
- [ ] Manual payout marking works (if used)
- [ ] **Full MVP flow passes**: register → become seller → KYC approve → list → buyer pays →
      escrow hold → deliver → confirm/auto-release → seller wallet → payout → review; dispute path also works
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive admin
- [ ] Step 15 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step 🎉
MVP complete! Tell me **"Step 15 done"** → we move to **Phase 2 (AI moats)** OR jump to
**deployment** (Step 35) to go live with the MVP first. Main recommend karta hoon: pehle **deploy +
seed 10 sellers (Pokemon GO)**, real feedback lo, phir AI features. Tera call.

## 🔑 Tokens needed: **None** (uses earlier integrations).
