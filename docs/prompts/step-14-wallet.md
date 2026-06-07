# STEP 14 — Wallet + Seller Payouts

> Goal: Sellers see earnings (from the ledger) and withdraw via Razorpay (INR) or crypto. Guardrail §1.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend Developer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§1 ledger, §2 webhooks). Work in `D:\GetX`.
This is **Step 14 — Wallet + payouts**. Talk Hinglish. Follow the full workflow.

### Task
1. **Wallet page** (`(dashboard)/seller/wallet`): available balance (derived from ledger),
   pending (in-escrow) amount, full ledger history (credits/debits with reason + date), filters.
2. **Payout request**: seller requests withdrawal (≥ min payout) to a method
   (RAZORPAY/INR or CRYPTO). Validate balance server-side, in a `prisma.$transaction`:
   create `Payout(REQUESTED)` + a `DEBIT/PAYOUT` ledger entry (reserve funds) so it can't be double-spent.
3. **Process payout**: integrate RazorpayX (INR payout) and/or CoinGate (crypto payout) — or, for MVP,
   an **admin-approved manual payout** flow (admin marks PAID) if automated payout keys aren't ready.
   Update `Payout` status; handle provider webhook (idempotent, signature-verified) → `PAID`/`FAILED`
   (on FAILED, reverse the reserve with a CREDIT ledger entry).
4. **Edge cases**: insufficient balance, double request, payout while disputed funds pending,
   provider failure reversal, min/max limits, currency.

### Rules
- Balance always derived from ledger; reserve on request so balance can't be double-withdrawn.
- All money moves in transactions; payouts idempotent; verify provider signatures.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Wallet shows correct available vs pending (escrow) from ledger
- [ ] Payout request reserves funds (DEBIT entry); can't exceed balance; no double-withdraw
- [ ] Payout PAID/FAILED handled; FAILED reverses the reserve (CREDIT back)
- [ ] Webhook idempotent + signature-verified (if automated payouts used)
- [ ] Min payout + edge cases handled
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive
- [ ] Step 14 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Request a test payout as a seller. Tell me **"Step 14 done"** → Step 15 (Admin + KYC + disputes).

## 🔑 Tokens needed for THIS step
For **automated** payouts: RazorpayX and/or CoinGate payout API keys. For MVP you can start with
**manual admin payouts** (no extra token). Tu bata kaunsa chahiye — main us hisaab se banaunga.
