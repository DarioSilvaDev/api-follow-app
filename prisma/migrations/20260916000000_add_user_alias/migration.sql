-- Fase 2 — Alias de usuario (D-077 / D-091)
-- ============================================================
-- `users.alias` (público, editable) + `users.last_alias_changed_at`
-- (cooldown de cambio).
--
-- Unicidad case-insensitive (D-077): Prisma `@unique` (users_alias_key)
-- es case-sensitive. Se agrega además un índice único FUNCIONAL en
-- LOWER(alias) como enforcement a nivel base de datos. El handler
-- normaliza a lowercase y pre-valida duplicados para responder 409 con
-- mensaje claro en lugar del constraint error (spec §5.1).
-- ============================================================

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "alias" VARCHAR(30),
ADD COLUMN     "last_alias_changed_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_alias_key" ON "users"("alias");

-- CreateIndex — D-077: unicidad case-insensitive del alias
CREATE UNIQUE INDEX "users_alias_lower_idx" ON "users" (LOWER("alias"));