# STEP 13 — Reviews & Ratings

> Goal: Verified-buyer reviews that build seller trust (a core conversion driver). Anti-abuse.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Product Manager + Senior Backend Developer of GETX. Read `CLAUDE.md` +
`docs/STRATEGY.md` (trust). Work in `D:\GetX`. This is **Step 13 — Reviews**. Talk Hinglish.
Follow the full workflow.

### Task
1. **Leave a review**: only the **buyer of a COMPLETED order** can review that order (one review per
   order — `Review.orderId` unique). Rating 1-5 + optional comment. Server Action validates eligibility.
2. **Aggregation**: on new/edited review, recompute seller `ratingAvg` + `ratingCount`
   (in a transaction, or derive). Show on seller profile, listing detail (Step 07), ListingCard.
3. **Display**: reviews list on seller profile + listing detail (paginated), with reviewer name,
   stars, date, comment, "Verified purchase" badge.
4. **Anti-abuse**: no self-review, no review without a completed order, basic profanity guard,
   one per order, rate-limit. Optional seller reply to a review.
5. **States**: empty ("No reviews yet"), loading, edge (deleted user/listing).

### Rules
- Eligibility checked server-side (must own a COMPLETED order). Ownership enforced.
- Aggregates consistent with stored reviews.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Only buyer of a COMPLETED order can review; one review per order (enforced)
- [ ] Seller ratingAvg/ratingCount update correctly and show everywhere
- [ ] Self-review / no-purchase review blocked; rate-limited
- [ ] Verified-purchase badge shows; empty/loading states present
- [ ] `typecheck`/`lint`/`build` pass; mobile responsive
- [ ] Step 13 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Complete an order + leave a review. Tell me **"Step 13 done"** → Step 14 (Wallet + payouts).

## 🔑 Tokens needed: **None.**
