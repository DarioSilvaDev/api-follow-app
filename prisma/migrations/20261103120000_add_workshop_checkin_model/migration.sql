-- B-1 — Modelo del check-in de taller (MVP "taller primero")
-- Generado con `prisma migrate diff` y completado a mano con los objetos que
-- Prisma 6 no modela (índice único parcial y CHECK XOR).

-- CreateEnum
CREATE TYPE "VehicleContactStatus" AS ENUM ('available', 'unavailable');

-- AlterTable
ALTER TABLE "care_episodes" ADD COLUMN     "close_notes" VARCHAR(1000),
ADD COLUMN     "closed_by_member_id" UUID,
ADD COLUMN     "mileage_in_unreadable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mileage_in_unreadable_reason" VARCHAR(200),
ADD COLUMN     "mileage_out" INTEGER,
ADD COLUMN     "mileage_out_unreadable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mileage_out_unreadable_reason" VARCHAR(200);

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "brand_name" VARCHAR(100),
ADD COLUMN     "model_name" VARCHAR(100);

-- CreateTable
CREATE TABLE "vehicle_owner_contacts" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "phone_e164" VARCHAR(20),
    "phone_area_code" VARCHAR(6),
    "phone_national_number" VARCHAR(12),
    "status" "VehicleContactStatus" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'workshop_counter',
    "recorded_by_member_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_owner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_type_specialties" (
    "id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "specialty_id" UUID NOT NULL,

    CONSTRAINT "service_type_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_episode_service_types" (
    "id" UUID NOT NULL,
    "care_episode_id" UUID NOT NULL,
    "service_type_id" UUID,
    "custom_label" VARCHAR(120),

    CONSTRAINT "care_episode_service_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_types_code_key" ON "service_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "service_type_specialties_service_type_id_specialty_id_key" ON "service_type_specialties"("service_type_id", "specialty_id");

-- CreateIndex
CREATE INDEX "care_episode_service_types_care_episode_id_idx" ON "care_episode_service_types"("care_episode_id");

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_closed_by_member_id_fkey" FOREIGN KEY ("closed_by_member_id") REFERENCES "workshop_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_owner_contacts" ADD CONSTRAINT "vehicle_owner_contacts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_owner_contacts" ADD CONSTRAINT "vehicle_owner_contacts_recorded_by_member_id_fkey" FOREIGN KEY ("recorded_by_member_id") REFERENCES "workshop_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_type_specialties" ADD CONSTRAINT "service_type_specialties_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_type_specialties" ADD CONSTRAINT "service_type_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episode_service_types" ADD CONSTRAINT "care_episode_service_types_care_episode_id_fkey" FOREIGN KEY ("care_episode_id") REFERENCES "care_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episode_service_types" ADD CONSTRAINT "care_episode_service_types_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Índice único parcial manual: Prisma 6 no modela índices parciales.
-- Un vehículo tiene como máximo un contacto de propietario activo.
-- Precedente: 20261007140000_vehicle_ownerships_unique_active_primary.
CREATE UNIQUE INDEX "vehicle_owner_contacts_active_unique"
  ON "vehicle_owner_contacts" ("vehicle_id")
  WHERE "is_active" = true;

-- CHECK XOR manual: cada fila es un tipo del catálogo o un texto libre, nunca
-- los dos y nunca ninguno. Precedente: vehicle_ownerships_owner_xor.
ALTER TABLE "care_episode_service_types"
  ADD CONSTRAINT "care_episode_service_types_xor"
  CHECK (("service_type_id" IS NULL) <> ("custom_label" IS NULL));
