-- CreateIndex
CREATE UNIQUE INDEX "vehicle_versions_model_id_name_key" ON "vehicle_versions"("model_id", "name");

-- CreateIndex
CREATE INDEX "vehicles_version_id_idx" ON "vehicles"("version_id");
