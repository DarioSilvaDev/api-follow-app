-- RenameColumn: refresh_token -> refresh_token_hash in user_sessions
-- This renames the existing column to match the updated Prisma schema.
-- Existing data is preserved; code should ensure values are hashed going forward.

-- Drop the existing unique index on refresh_token
DROP INDEX IF EXISTS "user_sessions_refresh_token_key";

-- Rename the column
ALTER TABLE "user_sessions" RENAME COLUMN "refresh_token" TO "refresh_token_hash";

-- Create a new unique index on the renamed column
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");