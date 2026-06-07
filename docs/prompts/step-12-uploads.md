# STEP 12 — Image / File Upload (Cloudflare R2)

> Goal: Real uploads via presigned URLs (browser → R2). Listing images public; KYC docs private.
> Replaces the placeholder upload from Step 06. Guardrail §6.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Backend + Senior Security Engineer of GETX. Read `CLAUDE.md` +
`docs/ENGINEERING-GUARDRAILS.md` (§6). Work in `D:\GetX`. This is **Step 12 — Uploads (R2)**.
Talk Hinglish. Follow the full workflow.

### Task
1. **R2 helper** (`src/lib/r2.ts`): S3-compatible client; functions to issue **presigned PUT URLs**
   (with content-type + size limits) and **presigned GET URLs** (short-lived) for private objects.
   Two buckets/prefixes: `public/` (listing images) and `private/` (KYC docs).
2. **Upload API** (`/api/uploads/presign`): auth required; **server-side validates** file type
   (images: jpg/png/webp) + max size before issuing the presigned URL; returns the URL + final key.
3. **Listing images**: replace the Step 06 placeholder — multi-image upload (browser → R2 directly),
   preview, reorder, set primary, delete. Store keys/URLs on the Listing. Render via next/image.
4. **KYC upload** (private): seller uploads ID doc to the **private** bucket; store the key in
   `KycSubmission`; only admins can view via short-lived signed GET URLs (used in Step 15).
5. **Edge cases**: wrong type/oversize rejected (server-side), failed upload retry, orphaned files
   note, broken image fallback, max images per listing.

### Rules
- Direct browser → R2 via presigned URLs (don't proxy big files through Next).
- Validate type/size on the server before presigning. KYC = private bucket + signed reads + access log.
- No public listing of private objects. Secrets in env only.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Listing image upload works (browser → R2); preview/reorder/primary/delete work
- [ ] Server rejects wrong type / oversize before presigning (test it)
- [ ] KYC doc lands in PRIVATE bucket; only admin can fetch via short-lived signed URL
- [ ] Public listing images render via next/image; broken-image fallback present
- [ ] No secrets in client; `.env` keys only
- [ ] `typecheck`/`lint`/`build` pass; mobile upload works
- [ ] Step 12 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Upload images to a listing. Tell me **"Step 12 done"** → Step 13 (Reviews & ratings).

## 🔑 Tokens needed for THIS step
**Cloudflare R2**: create a bucket → R2 API token (Access Key ID + Secret) + account id + endpoint.
(Free tier generous.) I'll wire + test once you provide them.
