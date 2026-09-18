-- Fase 1a consignación — M2 (D-TL-9 / D-TL-10 / D-TL-11 / D-DB-1 / D-DB-2)
-- Titular organizacional: VehicleOwnership / VehicleTransfer / VehicleTransferQr
-- admiten persona OR concesionaria. Enum QrPurpose. CHECKs XOR a nivel DB.
--
-- Migración ADITIVA: solo agrega columnas nullables nuevas y hace DROP NOT NULL
-- sobre user_id/from_user_id/to_user_id (las filas existentes siguen poblando
-- esos campos; ningún dato se modifica). El índice único parcial D-079
-- (`vehicle_transfer_qrs_one_active_per_vehicle`) NO se toca.
--
-- Nota Prisma 6: los CHECK constraints no se modelan en schema.prisma, por lo
-- que se definen aquí manualmente (patrón D-079). Prisma los ignora en el diff.

-- CreateEnum
CREATE TYPE "QrPurpose" AS ENUM ('take', 'sale', 'return');

-- AlterTable
ALTER TABLE "vehicle_ownerships" ADD COLUMN     "dealership_id" UUID,
ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vehicle_transfer_qrs" ADD COLUMN     "consumed_by_dealership_id" UUID,
ADD COLUMN     "consumed_by_member_id" UUID,
ADD COLUMN     "created_by_dealership_id" UUID,
ADD COLUMN     "purpose" "QrPurpose";

-- AlterTable
ALTER TABLE "vehicle_transfers" ADD COLUMN     "from_dealership_id" UUID,
ADD COLUMN     "to_dealership_id" UUID,
ALTER COLUMN "from_user_id" DROP NOT NULL,
ALTER COLUMN "to_user_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "vehicle_ownerships_dealership_id_ends_at_idx" ON "vehicle_ownerships"("dealership_id", "ends_at");

-- CreateIndex
CREATE INDEX "vehicle_transfer_qrs_created_by_dealership_id_idx" ON "vehicle_transfer_qrs"("created_by_dealership_id");

-- CreateIndex
CREATE INDEX "vehicle_transfer_qrs_consumed_by_dealership_id_idx" ON "vehicle_transfer_qrs"("consumed_by_dealership_id");

-- CreateIndex
CREATE INDEX "vehicle_transfer_qrs_consumed_by_member_id_idx" ON "vehicle_transfer_qrs"("consumed_by_member_id");

-- CreateIndex
CREATE INDEX "vehicle_transfers_from_dealership_id_idx" ON "vehicle_transfers"("from_dealership_id");

-- CreateIndex
CREATE INDEX "vehicle_transfers_to_dealership_id_idx" ON "vehicle_transfers"("to_dealership_id");

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_from_dealership_id_fkey" FOREIGN KEY ("from_dealership_id") REFERENCES "dealerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_to_dealership_id_fkey" FOREIGN KEY ("to_dealership_id") REFERENCES "dealerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfer_qrs" ADD CONSTRAINT "vehicle_transfer_qrs_created_by_dealership_id_fkey" FOREIGN KEY ("created_by_dealership_id") REFERENCES "dealerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfer_qrs" ADD CONSTRAINT "vehicle_transfer_qrs_consumed_by_dealership_id_fkey" FOREIGN KEY ("consumed_by_dealership_id") REFERENCES "dealerships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfer_qrs" ADD CONSTRAINT "vehicle_transfer_qrs_consumed_by_member_id_fkey" FOREIGN KEY ("consumed_by_member_id") REFERENCES "dealership_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- CHECK constraints manuales (D-DB-1). Prisma 6 no las modela en schema.
-- ===========================================================================

-- XOR titular persona|concesionaria en VehicleOwnership (D-TL-9).
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_owner_xor" CHECK (
    ("user_id" IS NOT NULL) <> ("dealership_id" IS NOT NULL)
);

-- Si el titular es una concesionaria, el tipo de ownership debe ser 'company'
-- (OwnershipType.company ya existe; no se renombra).
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_company_type" CHECK (
    "dealership_id" IS NULL OR "type" = 'company'
);

-- XOR from persona|concesionaria en VehicleTransfer (D-TL-10).
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_from_xor" CHECK (
    ("from_user_id" IS NOT NULL) <> ("from_dealership_id" IS NOT NULL)
);

-- XOR to persona|concesionaria en VehicleTransfer (D-TL-10).
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_to_xor" CHECK (
    ("to_user_id" IS NOT NULL) <> ("to_dealership_id" IS NOT NULL)
);

-- RB-03: la concesionaria no puede transferirse el vehículo a sí misma y una
-- persona no puede auto-transferirse. Enforcement a nivel DB (D-DB-1).
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_not_self" CHECK (
    NOT ("from_user_id" IS NOT NULL AND "from_user_id" = "to_user_id")
    AND NOT ("from_dealership_id" IS NOT NULL AND "from_dealership_id" = "to_dealership_id")
);

-- Consumo de QR: exclusivo. O bien persona (consumed_by_user_id), o bien
-- concesionaria (consumed_by_dealership_id + consumed_by_member_id actuante),
-- o bien aún no consumido (los tres NULL). (D-DB-1)
ALTER TABLE "vehicle_transfer_qrs" ADD CONSTRAINT "vehicle_transfer_qrs_consumed_by_xor" CHECK (
    (
        "consumed_by_user_id" IS NOT NULL
        AND "consumed_by_dealership_id" IS NULL
        AND "consumed_by_member_id" IS NULL
    )
    OR (
        "consumed_by_user_id" IS NULL
        AND "consumed_by_dealership_id" IS NOT NULL
        AND "consumed_by_member_id" IS NOT NULL
    )
    OR (
        "consumed_by_user_id" IS NULL
        AND "consumed_by_dealership_id" IS NULL
        AND "consumed_by_member_id" IS NULL
    )
);

-- Si la concesionaria consumió el QR, debe registrarse el miembro actuante
-- (patrón `recordedByMemberId`). (D-DB-1)
ALTER TABLE "vehicle_transfer_qrs" ADD CONSTRAINT "vehicle_transfer_qrs_consumed_member_required" CHECK (
    "consumed_by_dealership_id" IS NULL OR "consumed_by_member_id" IS NOT NULL
);