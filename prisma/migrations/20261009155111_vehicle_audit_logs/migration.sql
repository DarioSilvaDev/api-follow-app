-- CreateEnum
CREATE TYPE "VehicleAuditAction" AS ENUM ('vin_corrected', 'mileage_recorded');

-- CreateTable
CREATE TABLE "vehicle_audit_logs" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "action" "VehicleAuditAction" NOT NULL,
    "field" TEXT NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,
    "actor_user_id" UUID NOT NULL,
    "dealership_id" UUID,
    "dealership_member_id" UUID,
    "context_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_audit_logs_vehicle_id_created_at_idx" ON "vehicle_audit_logs"("vehicle_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "vehicle_audit_logs" ADD CONSTRAINT "vehicle_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_audit_logs" ADD CONSTRAINT "vehicle_audit_logs_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_audit_logs" ADD CONSTRAINT "vehicle_audit_logs_dealership_member_id_fkey" FOREIGN KEY ("dealership_member_id") REFERENCES "dealership_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_audit_logs" ADD CONSTRAINT "vehicle_audit_logs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
