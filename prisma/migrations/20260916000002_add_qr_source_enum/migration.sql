-- D-095 (D-085): `source` pasa de VARCHAR(20) a enum PostgreSQL QrSource.
-- Los valores existentes ('presencial' | 'concesionaria') son válidos → USING directo.
-- PostgreSQL no castea automáticamente el DEFAULT varchar → se dropea, se
-- cambia el tipo y se re-aplica el default con el cast correcto.

-- CreateEnum
CREATE TYPE "QrSource" AS ENUM ('presencial', 'concesionaria');

-- AlterTable
ALTER TABLE "vehicle_transfer_qrs"
    ALTER COLUMN "source" DROP DEFAULT;

ALTER TABLE "vehicle_transfer_qrs"
    ALTER COLUMN "source" TYPE "QrSource" USING ("source"::"QrSource");

ALTER TABLE "vehicle_transfer_qrs"
    ALTER COLUMN "source" SET DEFAULT 'presencial'::"QrSource";