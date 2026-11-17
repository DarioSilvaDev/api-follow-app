-- User phone, D-173-style split for the account phone:
-- `phone` keeps the canonical E.164 (existing users untouched).
-- The two display parts are NOT NULL with '' = "no informado" so the
-- migration is safe on existing rows (empty string, not NULL semantics).
ALTER TABLE "users"
  ADD COLUMN "phone_area_code" VARCHAR(6) NOT NULL DEFAULT '',
  ADD COLUMN "phone_national_number" VARCHAR(12) NOT NULL DEFAULT '';
