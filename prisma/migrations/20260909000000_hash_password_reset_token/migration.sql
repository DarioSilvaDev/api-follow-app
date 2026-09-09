-- AlterTable: Add token_hash column as nullable initially
ALTER TABLE "password_resets" ADD COLUMN "token_hash" TEXT;

-- Enable pgcrypto for SHA-256 hashing (idempotent)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- MigrateData: Hash existing tokens into token_hash
UPDATE "password_resets"
SET "token_hash" = encode(digest("token", 'sha256'), 'hex')
WHERE "token_hash" IS NULL;

-- Set NOT NULL after data migration
ALTER TABLE "password_resets" ALTER COLUMN "token_hash" SET NOT NULL;

-- CreateIndex: Unique constraint on token_hash (after column exists and is populated)
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- DropColumn: Remove old plaintext token column
ALTER TABLE "password_resets" DROP COLUMN "token";
