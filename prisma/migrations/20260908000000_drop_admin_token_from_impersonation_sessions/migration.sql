-- Drop admin_token from impersonation_sessions (Security Review P1 / D-016 A2)
--
-- Since D-016 A1, stop-impersonate re-signs a fresh admin access token and
-- NEVER reads the stored adminToken; the plaintext token is not needed anymore.
-- Dropping the column also drops its UNIQUE constraint/index
-- (impersonation_sessions_admin_token_key) automatically.
--
-- Non-destructive: only removes a no-longer-read column. The absolute 1h
-- impersonation window continues to be enforced server-side by expiresAt.

ALTER TABLE "impersonation_sessions" DROP COLUMN "admin_token";