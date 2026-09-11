-- CreateEnum
CREATE TYPE "CareEpisodeStatus" AS ENUM ('open', 'delivered', 'cancelled');

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "care_episode_id" UUID;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "care_episode_id" UUID;

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "care_episode_id" UUID;

-- CreateTable
CREATE TABLE "care_episodes" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "appointment_id" UUID,
    "created_by_member_id" UUID NOT NULL,
    "status" "CareEpisodeStatus" NOT NULL DEFAULT 'open',
    "mileage_in" INTEGER,
    "customer_complaint" VARCHAR(500),
    "customer_notes" VARCHAR(1000),
    "internal_notes" VARCHAR(1000),
    "checked_in_at" TIMESTAMPTZ NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_episodes_vehicle_id_created_at_idx" ON "care_episodes"("vehicle_id", "created_at");

-- CreateIndex
CREATE INDEX "care_episodes_workshop_id_created_at_idx" ON "care_episodes"("workshop_id", "created_at");

-- CreateIndex
CREATE INDEX "care_episodes_status_idx" ON "care_episodes"("status");

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "workshop_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "workshop_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_care_episode_id_fkey" FOREIGN KEY ("care_episode_id") REFERENCES "care_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_care_episode_id_fkey" FOREIGN KEY ("care_episode_id") REFERENCES "care_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_care_episode_id_fkey" FOREIGN KEY ("care_episode_id") REFERENCES "care_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
