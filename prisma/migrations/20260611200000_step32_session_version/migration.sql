-- Step 32 (Security Hardening): session revocation support.
-- A monotonically increasing version stamped into every JWT. Bumped on ban,
-- role-change and password-reset so existing tokens are force-invalidated on
-- their next refresh (we use the stateless JWT strategy — no DB sessions to
-- delete). Default 0 so all existing tokens stay valid until the next bump.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
