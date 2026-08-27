-- Add key column as nullable first
ALTER TABLE "vehicle_photos" ADD COLUMN "key" TEXT;
ALTER TABLE "vehicle_documents" ADD COLUMN "key" TEXT;

-- Populate key from url for existing rows
UPDATE "vehicle_photos" SET "key" = "url" WHERE "key" IS NULL;
UPDATE "vehicle_documents" SET "key" = "url" WHERE "key" IS NULL;

-- Make key required and unique
ALTER TABLE "vehicle_photos" ALTER COLUMN "key" SET NOT NULL;
ALTER TABLE "vehicle_documents" ALTER COLUMN "key" SET NOT NULL;

CREATE UNIQUE INDEX "vehicle_photos_key_key" ON "vehicle_photos"("key");
CREATE UNIQUE INDEX "vehicle_documents_key_key" ON "vehicle_documents"("key");

-- Drop old url column
ALTER TABLE "vehicle_photos" DROP COLUMN "url";
ALTER TABLE "vehicle_documents" DROP COLUMN "url";