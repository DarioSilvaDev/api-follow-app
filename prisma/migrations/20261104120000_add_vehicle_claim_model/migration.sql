-- C-1 — Modelo de reclamo de vehículo (MVP "taller primero").
-- Diseño: docs/designs/vehicle-claim-technical-design.md §3.1.
-- Generado con `prisma migrate diff` y completado a mano con el índice único
-- parcial que Prisma 6 no modela en schema.prisma.
--
-- Migración ADITIVA: crea enums y tablas nuevas, y agrega UNA columna nullable
-- a `vehicle_ownerships`. No modifica datos ni constraints existentes.
--
-- S-1: el token crudo NUNCA se persiste. `token_hash` guarda SHA-256 hex y es
-- unique; la fila no tiene columna de token en claro.

-- CreateEnum
CREATE TYPE "VehicleClaimStatus" AS ENUM ('pending', 'verification_required', 'verified', 'manual_review', 'claimed', 'claim_blocked', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "VehicleClaimRevokeReason" AS ENUM ('by_workshop', 'by_admin', 'manual_review_rejected', 'vehicle_deleted', 'max_attempts', 'dispute_lost');

-- CreateEnum
CREATE TYPE "VehicleClaimOutcome" AS ENUM ('ownership_created', 'already_owner');

-- CreateEnum
CREATE TYPE "VehicleClaimAttemptOutcome" AS ENUM ('verification_failed', 'verification_passed', 'manual_review', 'claim_success', 'claim_already_owner', 'claim_blocked', 'lockout_started', 'lockout_released', 'auto_revoked');

-- CreateEnum
CREATE TYPE "VehicleClaimDisputeStatus" AS ENUM ('open', 'under_review', 'resolved_claimant', 'resolved_rejected');

-- AlterTable
ALTER TABLE "vehicle_ownerships" ADD COLUMN     "acquired_by_claim_invite_id" UUID;

-- CreateTable
CREATE TABLE "vehicle_claim_invites" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "care_episode_id" UUID,
    "token_hash" VARCHAR(64) NOT NULL,
    "qr_object_key" VARCHAR(300),
    "status" "VehicleClaimStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "owner_phone" VARCHAR(30),
    "claimant_user_id" UUID,
    "opened_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_failed_at" TIMESTAMP(3),
    "verification_locked_at" TIMESTAMP(3),
    "lockout_count" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMP(3),
    "blocked_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" UUID,
    "revoke_reason" "VehicleClaimRevokeReason",
    "claim_outcome" "VehicleClaimOutcome",
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_claim_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_claim_attempts" (
    "id" UUID NOT NULL,
    "invite_id" UUID NOT NULL,
    "outcome" "VehicleClaimAttemptOutcome" NOT NULL,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(300),
    "plate_input" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_claim_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_claim_disputes" (
    "id" UUID NOT NULL,
    "invite_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "claimant_user_id" UUID,
    "opened_by_user_id" UUID,
    "contact_phone" VARCHAR(30),
    "motivo" VARCHAR(500) NOT NULL,
    "evidence_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "VehicleClaimDisputeStatus" NOT NULL DEFAULT 'open',
    "resolution" VARCHAR(1000),
    "reviewed_by_id" UUID,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_claim_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_claim_invites_token_hash_key" ON "vehicle_claim_invites"("token_hash");

-- CreateIndex
CREATE INDEX "vehicle_claim_invites_vehicle_id_status_idx" ON "vehicle_claim_invites"("vehicle_id", "status");

-- CreateIndex
CREATE INDEX "vehicle_claim_invites_workshop_id_created_at_idx" ON "vehicle_claim_invites"("workshop_id", "created_at");

-- CreateIndex
CREATE INDEX "vehicle_claim_attempts_invite_id_created_at_idx" ON "vehicle_claim_attempts"("invite_id", "created_at");

-- CreateIndex
CREATE INDEX "vehicle_claim_disputes_status_opened_at_idx" ON "vehicle_claim_disputes"("status", "opened_at");

-- CreateIndex
CREATE INDEX "vehicle_claim_disputes_vehicle_id_idx" ON "vehicle_claim_disputes"("vehicle_id");

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_acquired_by_claim_invite_id_fkey" FOREIGN KEY ("acquired_by_claim_invite_id") REFERENCES "vehicle_claim_invites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_invites" ADD CONSTRAINT "vehicle_claim_invites_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_invites" ADD CONSTRAINT "vehicle_claim_invites_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_invites" ADD CONSTRAINT "vehicle_claim_invites_care_episode_id_fkey" FOREIGN KEY ("care_episode_id") REFERENCES "care_episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_invites" ADD CONSTRAINT "vehicle_claim_invites_claimant_user_id_fkey" FOREIGN KEY ("claimant_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_invites" ADD CONSTRAINT "vehicle_claim_invites_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_invites" ADD CONSTRAINT "vehicle_claim_invites_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_attempts" ADD CONSTRAINT "vehicle_claim_attempts_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "vehicle_claim_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_disputes" ADD CONSTRAINT "vehicle_claim_disputes_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "vehicle_claim_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_disputes" ADD CONSTRAINT "vehicle_claim_disputes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_disputes" ADD CONSTRAINT "vehicle_claim_disputes_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_claim_disputes" ADD CONSTRAINT "vehicle_claim_disputes_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Índice único parcial (SQL manual, D-TL-VC-8): un vehículo puede tener como
-- máximo UNA invitación de reclamo vigente. Los estados terminales
-- (`claimed`, `claim_blocked`, `revoked`) y `expired` quedan fuera del
-- predicado, así que no bloquean una nueva invitación.
--
-- OJO: los literales van en MINÚSCULA porque el enum Prisma se declara en
-- lowercase y no usa @map por valor (mismo criterio que CareEpisodeStatus).
-- Si se copian en mayúscula, Postgres rechaza el índice al castear al enum.
--
-- Prisma 6 no soporta índices parciales en schema.prisma; se define solo acá
-- y Prisma lo ignora en el diff. Sin CONCURRENTLY: `migrate deploy` corre la
-- migración en una transacción.
CREATE UNIQUE INDEX "vehicle_claim_invites_active_unique"
  ON "vehicle_claim_invites" ("vehicle_id")
  WHERE "status" IN ('pending', 'verification_required', 'verified', 'manual_review');
