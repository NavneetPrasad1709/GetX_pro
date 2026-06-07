# STEP 03 — Auth + Roles + Bot Protection

> Goal: Secure login/register with Auth.js (NextAuth v5), roles (buyer/seller/admin), email
> verification, session security, ownership helpers, and Cloudflare Turnstile. Follow guardrail §7.

---

## PROMPT (copy from here ⬇️)

You are the CTO + Senior Security Engineer of GETX. Read `CLAUDE.md` and
`docs/ENGINEERING-GUARDRAILS.md` (§7, §9). Work in `D:\GetX`. This is **Step 03 — Auth + roles**.
Talk Hinglish. Follow the full workflow.

### Task
1. **Install + configure Auth.js (NextAuth v5)** with the Prisma adapter (uses Step 02 tables).
   - Credentials provider: email + password. Hash with **bcrypt** (or argon2). Never store plaintext.
   - (Optional but wire the config for) Google OAuth — leave creds in env, off if not provided.
   - Session: JWT or database sessions; secure, httpOnly, sameSite cookies; set `AUTH_SECRET`.
2. **Email verification flow**: on register, create a `VerificationToken`; user must verify before
   selling. For now, if no email provider, log the verify link to console + show it in dev
   (real email = Resend, later). Make the verify page work end-to-end.
3. **Pages** (in `src/app/(auth)/`): `register`, `login`, `verify-email`, `forgot-password` (stub UI ok
   but wire reset token flow). Use react-hook-form + Zod. Show error/loading states.
4. **Cloudflare Turnstile** on register + login (server-side verify the token). If no Turnstile keys
   in env, allow a dev bypass flag so local dev still works, but default ON.
5. **Roles + helpers** in `src/lib/auth.ts` / `src/server/services`:
   - `auth()` to get session; `requireUser()`, `requireRole('SELLER'|'ADMIN')`, `assertOwner(resource, userId)`.
   - Role: everyone starts `BUYER`; "become a seller" upgrades to `SELLER` (creates SellerProfile + Wallet).
6. **Middleware / route protection**: protect `(dashboard)` and `admin`. Redirect unauthorized.
   Admin area requires `ADMIN`.
7. **Rate limit** auth endpoints (simple in-memory or Upstash-free later; for now a basic IP limiter).
8. **Header auth state**: show login/register when logged out; avatar + menu (Dashboard, Sell, Logout)
   when logged in. (Full design polish is Step 04 — keep it clean + functional.)

### Rules
- Server-side validate everything. Check role + ownership on protected actions.
- Secrets only from env. No plaintext passwords. No secrets in client bundle.

### Report back
CLAUDE.md output format + QA CHECKLIST below.

---

## ✅ QA CHECKLIST
- [ ] Register → verify → login works end-to-end (verify link shown in dev)
- [ ] Passwords are hashed (check DB: no plaintext)
- [ ] Wrong password / unverified / duplicate email handled with clear errors
- [ ] `(dashboard)` and `admin` redirect when not logged in / wrong role
- [ ] "Become a seller" creates SellerProfile + Wallet and upgrades role
- [ ] Turnstile verifies on register/login (dev bypass documented)
- [ ] Rate limiting blocks rapid repeated login attempts
- [ ] `npm run typecheck` / `lint` / `build` all pass
- [ ] Mobile: auth pages responsive
- [ ] Step 03 ticked; DECISIONS updated
- [ ] Final Status: ✅ Pass

---

## 👉 After this step
Register a test account + a seller account. Tell me **"Step 3 done"** → Step 04 (Design system + layout).

## 🔑 Tokens needed for THIS step
**Cloudflare Turnstile keys** (free) — optional for local (dev bypass), needed before launch.
Get: Cloudflare dashboard → Turnstile → Add site → copy **Site Key** + **Secret Key**.
(Google OAuth optional — skip for now if you want.)

