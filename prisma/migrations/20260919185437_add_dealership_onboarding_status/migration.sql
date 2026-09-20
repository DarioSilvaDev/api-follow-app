-- Onboarding administrado de concesionaria (decisión PM): la concesionaria
-- nace en `pending_claim` (alta por admin de plataforma + invitación al dueño)
-- y pasa a `active` cuando el dueño completa el wizard público (`claimed_at`).
--
-- Migración ADITIVA (sin drops ni renombres). Backfill explícito:
-- las filas existentes de `dealerships` nacieron por D-103 (alta rápida con
-- owner directo) o por el seed → ya están reclamadas/operativas y quedan en
-- `status = 'active'`. El default final para filas futuras es `pending_claim`.
--
-- Resultado final esperado por schema.prisma (sin drift):
--   dealerships.status    DealershipStatus NOT NULL DEFAULT 'pending_claim'
--   dealerships.claimed_at TIMESTAMP(3) NULL

-- CreateEnum
CREATE TYPE "DealershipStatus" AS ENUM ('pending_claim', 'active');

-- AlterTable: la columna se agrega con default temporal 'active' para que las
-- filas existentes queden consistentes durante la propia migración.
ALTER TABLE "dealerships" ADD COLUMN     "status" "DealershipStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "claimed_at" TIMESTAMP(3);

-- Backfill: garantía explícita de que TODAS las concesionarias preexistentes
-- quedan en 'active' (no dependen del default temporal).
UPDATE "dealerships" SET "status" = 'active' WHERE "status" <> 'active';

-- Default final: las nuevas filas (onboarding admin) nacen 'pending_claim'.
ALTER TABLE "dealerships" ALTER COLUMN "status" SET DEFAULT 'pending_claim';