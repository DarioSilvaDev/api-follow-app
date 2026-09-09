-- HCDV F-2 (QA E2E F-010)
-- ============================================================
-- Vehicle catalog seed versions were created with non-v4 (v0)
-- deterministic UUIDs: 00000000-0000-0000-0000-000000000001..009
-- class-validator `@IsUUID()` (default 'all'/'4') rejects v0 ids,
-- so register-vehicle failed with 400 "versionId must be a UUID".
-- The DTO and schema are correct (Tech Lead approved); the data
-- is wrong, so we re-key the 9 seeded versions to v4-deterministic,
-- valid ids: 00000000-0000-4000-8000-000000000001..009
-- (version group '4' + variant '8' -> passes isUUID v4/all).
--
-- Migration strategy:
--   In-place PK re-key via UPDATE (preserves every column of the
--   existing 9 rows). `vehicles.version_id` FK is
--   ON UPDATE CASCADE ON DELETE SET NULL, so the 2 vehicles that
--   reference old ids (…007, …008) are re-pointed automatically.
--   Only `vehicles` references `vehicle_versions` (verified).
--   Safe on fresh databases: 0 rows match -> no-op.
-- ============================================================

UPDATE "vehicle_versions" SET "id" = '00000000-0000-4000-8000-000000000001' WHERE "id" = '00000000-0000-0000-0000-000000000001';
UPDATE "vehicle_versions" SET "id" = '00000000-0000-4000-8000-000000000002' WHERE "id" = '00000000-0000-0000-0000-000000000002';
UPDATE "vehicle_versions" SET "id" = '00000000-0000-4000-8000-000000000003' WHERE "id" = '00000000-0000-0000-0000-000000000003';
UPDATE "vehicle_versions" SET "id" = '00000000-0000-4000-8000-000000000004' WHERE "id" = '00000000-0000-0000-0000-000000000004';
UPDATE "vehicle_versions" SET "id" = '00000000-0000-4000-8000-000000000005' WHERE "id" = '00000000-0000-0000-0000-000000000005';
UPDATE "vehicle_versions" SET "id" = '00000000-0000-4000-8000-000000000006' WHERE "id" = '00000000-0000-0000-0000-000000000006';
UPDATE "vehicle_versions" SET "id" = '00000000-0000-4000-8000-000000000007' WHERE "id" = '00000000-0000-0000-0000-000000000007';
UPDATE "vehicle_versions" SET "id" = '00000000-0000-4000-8000-000000000008' WHERE "id" = '00000000-0000-0000-0000-000000000008';
UPDATE "vehicle_versions" SET "id" = '00000000-0000-4000-8000-000000000009' WHERE "id" = '00000000-0000-0000-0000-000000000009';