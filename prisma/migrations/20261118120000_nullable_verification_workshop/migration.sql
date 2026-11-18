-- AlterTable
ALTER TABLE "care_episodes" ALTER COLUMN "verification" DROP NOT NULL,
ALTER COLUMN "verification" DROP DEFAULT;

-- Backfill: source='workshop' => verification no aplica (NULL).
-- source='owner' conserva unverified|verified|rejected.
UPDATE "care_episodes" SET "verification" = NULL WHERE "source" = 'workshop';
