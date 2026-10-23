-- Vínculo 1:1 Concesionaria ↔ Service Center (D-TL-1 / D-TL-7 / RG-1 / RG-2).
-- Migración ADITIVA y NO destructiva.
--   * workshops.dealership_id nullable + UNIQUE: un taller vinculado ≤1
--     concesionaria; talleres independientes (w01..w20) quedan en NULL.
--   * FK ON DELETE SET NULL: borrar la concesionaria solo desvincula al taller
--     (queda independiente); no propaga borrado a miembros, roles, permisos ni
--     CareEpisodes (RG-2). ON UPDATE CASCADE es el default de Prisma sobre una
--     columna UUID (los id nunca se renombran en la práctica).

-- AlterTable
ALTER TABLE "workshops" ADD COLUMN     "dealership_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "workshops_dealership_id_key" ON "workshops"("dealership_id");

-- AddForeignKey
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE SET NULL ON UPDATE CASCADE;