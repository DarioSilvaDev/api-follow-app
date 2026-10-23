-- Migración B (D-01 / diseño gap-1 §3.2):
-- Atribución de `VehicleMileage` en contexto concesionaria, replicando el
-- patrón ya aprobado de `VehicleTransferQr` (persona física + contexto org +
-- miembro actuante).
--
-- RULING Tech Lead: los 3 registros `source='dealership'` SÍ son atribuibles
-- (sus actores son `DealershipMember`). NO se degrada `source` ni se excluye
-- el CHECK: el backfill deriva la atribución desde `recorded_by_user_id`
-- vía `dealership_members`.
--
-- IMPORTANTE: el rename se hace como RENAME COLUMN explícito (NO DROP+ADD)
-- para preservar los 18 valores históricos de `recorded_by_member_id`.
-- También se renombra la FK para conservar la convención de nombres de Prisma
-- (<tabla>_<columna>_fkey) y no generar drift en `migrate dev`.

-- 1) Renombre explícito: el nombre actual prometía un modelo que no referenciaba.
ALTER TABLE "vehicle_mileages" RENAME COLUMN "recorded_by_member_id" TO "recorded_by_workshop_member_id";
ALTER TABLE "vehicle_mileages" RENAME CONSTRAINT "vehicle_mileages_recorded_by_member_id_fkey" TO "vehicle_mileages_recorded_by_workshop_member_id_fkey";

-- 2) Contexto organizacional + miembro actuante (patrón VehicleTransferQr).
ALTER TABLE "vehicle_mileages"
  ADD COLUMN "recorded_by_dealership_id" uuid,
  ADD COLUMN "recorded_by_dealership_member_id" uuid;

-- 3) Índices sobre las nuevas FKs (PostgreSQL no indexa las FKs automáticamente;
--    mismo patrón que VehicleTransferQr).
CREATE INDEX "vehicle_mileages_recorded_by_dealership_id_idx" ON "vehicle_mileages"("recorded_by_dealership_id");
CREATE INDEX "vehicle_mileages_recorded_by_dealership_member_id_idx" ON "vehicle_mileages"("recorded_by_dealership_member_id");

-- 4) Foreign keys.
ALTER TABLE "vehicle_mileages"
  ADD CONSTRAINT "vehicle_mileages_recorded_by_dealership_id_fkey"
  FOREIGN KEY ("recorded_by_dealership_id") REFERENCES "dealerships"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_mileages"
  ADD CONSTRAINT "vehicle_mileages_recorded_by_dealership_member_id_fkey"
  FOREIGN KEY ("recorded_by_dealership_member_id") REFERENCES "dealership_members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Backfill (entre el ADD COLUMN y los CHECK): derivar la atribución de
--    concesionaria desde `recorded_by_user_id` vía `dealership_members`.
--
--    Determinismo (ruling Tech Lead): si un `user_id` tuviera más de un
--    DealershipMember, preferir el de la concesionaria que tuvo una ownership
--    que cubra `recorded_at`. Si aun así queda ambiguo (0 o >=2 candidatos
--    preferidos con total >= 2), se ABORTA la migración: no se elige arbitrario.
DO $$
DECLARE
  ambiguous_count integer;
BEGIN
  WITH candidates AS (
    SELECT
      vm."id" AS mileage_id,
      EXISTS (
        SELECT 1
        FROM "vehicle_ownerships" vo
        WHERE vo."vehicle_id" = vm."vehicle_id"
          AND vo."dealership_id" = dm."dealership_id"
          AND vm."recorded_at" >= vo."starts_at"
          AND (vo."ends_at" IS NULL OR vm."recorded_at" < vo."ends_at")
      ) AS covered
    FROM "vehicle_mileages" vm
    JOIN "dealership_members" dm ON dm."user_id" = vm."recorded_by_user_id"
    WHERE vm."source" = 'dealership'
  ),
  per_row AS (
    SELECT
      mileage_id,
      count(*) AS total,
      count(*) FILTER (WHERE covered) AS covered_count
    FROM candidates
    GROUP BY mileage_id
  )
  SELECT count(*) INTO ambiguous_count
  FROM per_row
  WHERE covered_count >= 2
     OR (covered_count = 0 AND total >= 2);

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Backfill de atribución dealership ambiguo: % fila(s) de vehicle_mileages con source=dealership y múltiples DealershipMember sin desambiguar por ownership', ambiguous_count;
  END IF;
END $$;

WITH ranked AS (
  SELECT
    vm."id" AS mileage_id,
    dm."id" AS member_id,
    dm."dealership_id" AS dealership_id,
    ROW_NUMBER() OVER (
      PARTITION BY vm."id"
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1
          FROM "vehicle_ownerships" vo
          WHERE vo."vehicle_id" = vm."vehicle_id"
            AND vo."dealership_id" = dm."dealership_id"
            AND vm."recorded_at" >= vo."starts_at"
            AND (vo."ends_at" IS NULL OR vm."recorded_at" < vo."ends_at")
        ) THEN 0 ELSE 1 END,
        dm."joined_at" ASC,
        dm."id" ASC
    ) AS rn
  FROM "vehicle_mileages" vm
  JOIN "dealership_members" dm ON dm."user_id" = vm."recorded_by_user_id"
  WHERE vm."source" = 'dealership'
    AND vm."recorded_by_dealership_id" IS NULL
    AND vm."recorded_by_dealership_member_id" IS NULL
)
UPDATE "vehicle_mileages" vm
SET "recorded_by_dealership_id" = r."dealership_id",
    "recorded_by_dealership_member_id" = r."member_id"
FROM ranked r
WHERE r."rn" = 1 AND vm."id" = r."mileage_id";

-- 6) Invariantes (CHECK) posteriores al backfill → 0 filas violando.
--    actor XOR: no puede ser a la vez miembro de taller y de concesionaria.
ALTER TABLE "vehicle_mileages"
  ADD CONSTRAINT "vehicle_mileages_actor_xor"
  CHECK (num_nonnulls("recorded_by_workshop_member_id", "recorded_by_dealership_member_id") <= 1);

--    contexto de concesionaria exige miembro actuante.
ALTER TABLE "vehicle_mileages"
  ADD CONSTRAINT "vehicle_mileages_dealership_attributed"
  CHECK ("recorded_by_dealership_id" IS NULL OR "recorded_by_dealership_member_id" IS NOT NULL);

--    source = 'dealership' exige contexto de concesionaria.
ALTER TABLE "vehicle_mileages"
  ADD CONSTRAINT "vehicle_mileages_dealership_source_attributed"
  CHECK ("source" <> 'dealership' OR "recorded_by_dealership_id" IS NOT NULL);

--    kilometraje no negativo.
ALTER TABLE "vehicle_mileages"
  ADD CONSTRAINT "vehicle_mileages_mileage_non_negative"
  CHECK ("mileage" >= 0);
