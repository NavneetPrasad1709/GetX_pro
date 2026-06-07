# 🚀 GETX — START HERE (paste-and-build guide)

Bhai yeh tera control panel hai. Isko padh, phir bas prompts paste karte ja.

## Tera kaam sirf 4 step ka loop hai
1. **Kholo** → `docs/prompts/step-XX-....md` (jis step pe ho).
2. **Copy** → us file me `## PROMPT (copy from here ⬇️)` ke neeche ka poora text.
3. **Paste** → Claude Code me. Claude khud banayega + neeche di **QA CHECKLIST** khud run karega.
4. **Bolo** → "Step X done" → main agle step ka guide/prompt de dunga.

> Ya aur easy: bas mujhe bol **"Step X start karo"** — main hi tera Claude Code hoon, yahin bana dunga.

## Order (yahi sequence follow karna)
Phase 0 (neenv): **01 → 02 → 03 → 04**
Phase 1 (MVP marketplace): **05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15**
→ Step 15 ke baad MVP **ready** hai. Phir deploy (Step 35) ya Phase 2 (AI features).

Poori list: `docs/ROADMAP.md`. Steps 16+ ke prompts main tab banaunga jab hum wahan pahunchenge
(taaki wo asli code ke hisaab se sahi rahein).

## Documents ka matlab (kya kahan hai)
- `CLAUDE.md` — Claude ke rules (auto-load hota hai har session). **Tujhe kuch train nahi karna.**
- `docs/STRATEGY.md` — kyun bana rahe hain (business dimaag).
- `docs/ENGINEERING-GUARDRAILS.md` — paisa/security/escrow ke pakke rules (bug se bachne ke liye).
- `docs/ROADMAP.md` — saare 36 steps, tick karte chalna.
- `docs/FOLDER-STRUCTURE.md` — code kahan rakhna.
- `docs/DECISIONS.md` — kaunsa decision kyun liya.
- `docs/prompts/` — ek-ek step ke ready prompts (yahi paste karne hain).

## Tokens (jab maangu tab dena, pehle nahi)
| Kab | Kya chahiye | Free? |
|---|---|---|
| Step 02 | Neon Postgres connection string (pooled + direct) | ✅ |
| Step 03 | Cloudflare Turnstile keys (optional local) | ✅ |
| Step 09 | CoinGate + Razorpay (TEST mode) + Sentry DSN | ✅ test |
| Step 12 | Cloudflare R2 keys | ✅ |
| Step 14 | RazorpayX/CoinGate payout keys (ya manual) | optional |
| Step 35 | GitHub + Vercel + Railway tokens (deploy) | ✅ |

Har step ki prompt file ke neeche **🔑 Tokens needed** section me exact bataया hai.

## Golden rules (yaad rakh)
- Ek time pe ek hi step. Pichla **✅ Pass** hone ke baad hi aage.
- Paisa = hamesha integer (paisa/cents). Kabhi float nahi.
- Token kabhi code me paste mat karna — sirf `.env.local` me.
- Kuch samajh na aaye? Bas pucho — main junior-friendly Hinglish me samjhaunga.

---
**Abhi shuru karne ke liye:** `docs/prompts/step-01-setup.md` kholo, ya mujhe bol **"Step 1 start karo"**. 🚀
