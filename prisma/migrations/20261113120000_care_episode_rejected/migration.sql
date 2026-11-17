-- Rechazo de registros del propietario (CareEpisode source=owner) — D-202..D-205.
-- Spec: docs/specs/owner-service-records-verification-flow.md (RF-9).
--
-- Migración ADITIVA: un valor nuevo al enum + 3 columnas nullable + FK.
-- Sin backfill: ninguna fila existente pasa a 'rejected' (los episodios
-- actuales siguen 'unverified'/'verified'). No reescribe datos.
--
-- Requiere PostgreSQL >= 12 (ALTER TYPE ... ADD VALUE dentro de la transacción
-- de la migración). El valor nuevo NO se usa dentro de esta misma migración.
--
-- ORÍGEN DEL SCRIPT: `prisma migrate diff --from-schema-datamodel <schema HEAD>
-- --to-schema-datamodel prisma/schema.prisma --script` (Prisma 6.19.3).
-- `prisma migrate dev` NO pudo usarse: detecta drift PREEXISTENTE en
-- 20261013115218_add_reason_to_vehicle_audit_logs ("migration was modified
-- after it was applied") y exige `migrate reset` — destructivo, fuera de
-- alcance. El drift queda como deuda documentada en la entrega.

-- AlterEnum
ALTER TYPE "CareEpisodeVerification" ADD VALUE IF NOT EXISTS 'rejected';

-- AlterTable
ALTER TABLE "care_episodes" ADD COLUMN     "rejected_at" TIMESTAMPTZ(6),
ADD COLUMN     "rejected_by_member_id" UUID,
ADD COLUMN     "rejection_reason" VARCHAR(500);

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_rejected_by_member_id_fkey" FOREIGN KEY ("rejected_by_member_id") REFERENCES "workshop_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
