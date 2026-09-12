-- CreateEnum
CREATE TYPE "CareEpisodeSource" AS ENUM ('workshop', 'owner');

-- CreateEnum
CREATE TYPE "CareEpisodeVerification" AS ENUM ('unverified', 'verified');

-- AlterTable
ALTER TABLE "care_episodes" ADD COLUMN     "created_by_user_id" UUID,
ADD COLUMN     "service_date" TIMESTAMPTZ,
ADD COLUMN     "source" "CareEpisodeSource" NOT NULL DEFAULT 'workshop',
ADD COLUMN     "title" VARCHAR(120),
ADD COLUMN     "verification" "CareEpisodeVerification" NOT NULL DEFAULT 'unverified',
ADD COLUMN     "verified_at" TIMESTAMPTZ,
ADD COLUMN     "verified_by_member_id" UUID,
ADD COLUMN     "workshop_name" VARCHAR(150),
ALTER COLUMN "workshop_id" DROP NOT NULL,
ALTER COLUMN "branch_id" DROP NOT NULL,
ALTER COLUMN "created_by_member_id" DROP NOT NULL,
ALTER COLUMN "checked_in_at" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "care_episodes_workshop_id_source_verification_idx" ON "care_episodes"("workshop_id", "source", "verification");

-- CreateIndex
CREATE INDEX "care_episodes_created_by_user_id_idx" ON "care_episodes"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_verified_by_member_id_fkey" FOREIGN KEY ("verified_by_member_id") REFERENCES "workshop_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
