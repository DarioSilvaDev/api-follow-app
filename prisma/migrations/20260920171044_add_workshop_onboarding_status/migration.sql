-- Onboarding administrado de taller (espejo patrón D-106 concesionaria): el
-- taller nace en `pending_claim` (alta por admin de plataforma + invitación al
-- dueño) y pasa a `active` cuando el dueño completa el wizard público
-- (`claimed_at`).
--
-- Migración ADITIVA (sin drops ni renombres). Backfill explícito:
-- las filas existentes de `workshops` son talleres reales ya operativos
-- (alta por D-024 / seed) → quedan en `status = 'active'`. El default final
-- para filas futuras es `pending_claim`.
--
-- Criterio `claimed_at` en backfill: se deja NULL en las filas existentes
-- (mismo criterio que la migración de concesionarias D-106 y que el seed:
-- los registros operativos por alta directa/seed no tienen un claim real
-- histórico). El backend setea `claimed_at` cuando el wizard de reclamo se
-- complete.
--
-- Resultado final esperado por schema.prisma (sin drift):
--   workshops.status    WorkshopStatus NOT NULL DEFAULT 'pending_claim'
--   workshops.claimed_at TIMESTAMP(3) NULL
--
-- ORTOGONALIDAD: `is_active` (habilitado/deshabilitado operativo) y
-- `deleted_at` (soft delete) NO se tocan en esta migración.

-- CreateEnum
CREATE TYPE "WorkshopStatus" AS ENUM ('pending_claim', 'active');

-- AlterTable: la columna se agrega con default temporal 'active' para que las
-- filas existentes queden consistentes durante la propia migración.
ALTER TABLE "workshops" ADD COLUMN     "status" "WorkshopStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "claimed_at" TIMESTAMP(3);

-- Backfill: garantía explícita de que TODOS los talleres preexistentes
-- quedan en 'active' (no dependen del default temporal). `claimed_at` queda
-- NULL (no hay claim histórico real).
UPDATE "workshops" SET "status" = 'active' WHERE "status" <> 'active';

-- Default final: las nuevas filas (onboarding admin) nacen 'pending_claim'.
ALTER TABLE "workshops" ALTER COLUMN "status" SET DEFAULT 'pending_claim';