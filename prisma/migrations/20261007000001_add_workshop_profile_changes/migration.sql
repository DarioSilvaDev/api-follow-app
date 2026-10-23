-- CreateTable
CREATE TABLE "workshop_profile_changes" (
    "id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "changed_by_user_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(200),
    "fields" JSONB NOT NULL,

    CONSTRAINT "workshop_profile_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workshop_profile_changes_workshop_id_changed_at_idx" ON "workshop_profile_changes"("workshop_id", "changed_at");

-- CreateIndex
CREATE INDEX "workshop_profile_changes_changed_by_user_id_idx" ON "workshop_profile_changes"("changed_by_user_id");

-- CreateIndex
CREATE INDEX "workshop_profile_changes_changed_at_idx" ON "workshop_profile_changes"("changed_at");

-- AddForeignKey
ALTER TABLE "workshop_profile_changes" ADD CONSTRAINT "workshop_profile_changes_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_profile_changes" ADD CONSTRAINT "workshop_profile_changes_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -- AddCheckConstraints (whitelist of auditable fields)
-- ALTER TABLE "workshop_profile_changes"
--   ADD CONSTRAINT "workshop_profile_changes_fields_whitelist_check"
--   CHECK ("fields" IS NULL OR jsonb_object_keys("fields") <@ ARRAY['name','legalName','taxId','email','phone','website','description']::text[]);

-- ALTER TABLE "workshop_profile_changes"
--   ADD CONSTRAINT "workshop_profile_changes_fields_non_empty_check"
--   CHECK ("fields" IS NULL OR jsonb_array_length(jsonb_object_keys("fields")) >= 1);

-- -- AddCheckConstraints (whitelist of auditable fields)
ALTER TABLE "workshop_profile_changes"
  ADD CONSTRAINT "workshop_profile_changes_fields_whitelist_check"
  CHECK ("fields" IS NULL OR ("fields" - ARRAY['name','legalName','taxId','email','phone','website','description']::text[] = '{}'::jsonb));

ALTER TABLE "workshop_profile_changes"
  ADD CONSTRAINT "workshop_profile_changes_fields_non_empty_check"
  CHECK ("fields" IS NULL OR "fields" != '{}'::jsonb);

