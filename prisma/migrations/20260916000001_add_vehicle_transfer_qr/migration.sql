-- CreateEnum
CREATE TYPE "QrStatus" AS ENUM ('pending', 'consumed', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "vehicle_transfer_qrs" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "status" "QrStatus" NOT NULL DEFAULT 'pending',
    "source" VARCHAR(20) NOT NULL DEFAULT 'presencial',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "consumed_by_user_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_transfer_qrs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_transfer_qrs_token_key" ON "vehicle_transfer_qrs"("token");

-- CreateIndex
CREATE INDEX "vehicle_transfer_qrs_vehicle_id_status_idx" ON "vehicle_transfer_qrs"("vehicle_id", "status");

-- Invariante D-079: como máximo 1 QR pending (sin resolver) por vehículo.
-- `expires_at > now()` no puede usarse en el predicado (funciones en índice
-- deben ser IMMUTABLE), por lo que la expiración de pendientes viejos se
-- resuelve lazy en el command de generación previo al insert.
CREATE UNIQUE INDEX "vehicle_transfer_qrs_one_active_per_vehicle" ON "vehicle_transfer_qrs"("vehicle_id") WHERE status = 'pending';

-- AddForeignKey
ALTER TABLE "vehicle_transfer_qrs" ADD CONSTRAINT "vehicle_transfer_qrs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfer_qrs" ADD CONSTRAINT "vehicle_transfer_qrs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfer_qrs" ADD CONSTRAINT "vehicle_transfer_qrs_consumed_by_user_id_fkey" FOREIGN KEY ("consumed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;