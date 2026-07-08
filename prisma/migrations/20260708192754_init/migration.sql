-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "OauthProvider" AS ENUM ('google', 'apple', 'github', 'microsoft', 'facebook');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('pending', 'active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('gasoline', 'diesel', 'flex', 'electric', 'hybrid', 'cng', 'lpg');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('manual', 'automatic', 'cvt', 'automated');

-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('sedan', 'hatchback', 'suv', 'pickup', 'van', 'coupe', 'motorcycle', 'truck');

-- CreateEnum
CREATE TYPE "MileageSource" AS ENUM ('owner', 'workshop', 'inspection', 'dealership', 'imported', 'system');

-- CreateEnum
CREATE TYPE "VehicleTransferEventType" AS ENUM ('requested', 'reminder_sent', 'accepted', 'rejected', 'cancelled', 'expired', 'ownership_closed', 'ownership_created', 'completed');

-- CreateEnum
CREATE TYPE "SystemRoleType" AS ENUM ('super_admin', 'admin', 'support', 'user');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('owner', 'co_owner', 'company');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'expired');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30),
    "avatar_url" TEXT,
    "language" VARCHAR(10) NOT NULL DEFAULT 'es',
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "email_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_mfas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "method" TEXT NOT NULL DEFAULT 'totp',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "user_mfas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "failure_reason" TEXT,
    "logged_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device_name" TEXT,
    "last_activity_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT,
    "key_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "OauthProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshops" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "legal_name" VARCHAR(200),
    "tax_id" VARCHAR(30),
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "website" TEXT,
    "logo_url" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workshops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_branches" (
    "id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(255),
    "street" TEXT,
    "street_number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postal_code" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "is_headquarters" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_roles" (
    "id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_members" (
    "id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "default_branch_id" UUID,
    "joined_at" TIMESTAMP(3) NOT NULL,
    "left_at" TIMESTAMP(3),
    "invited_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "last_access_at" TIMESTAMP(3),
    "status" "MemberStatus" NOT NULL,

    CONSTRAINT "workshop_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_invitations" (
    "id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "invited_by" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "status" "InvitationStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "resource" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "code" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "workshop_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_roles" (
    "id" UUID NOT NULL,
    "type" "SystemRoleType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "system_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hours" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opens_at" TIME(0) NOT NULL,
    "closes_at" TIME(0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hour_exceptions" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "opens_at" TIME(0),
    "closes_at" TIME(0),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_hour_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_specialties" (
    "id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "specialty_id" UUID NOT NULL,

    CONSTRAINT "workshop_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "maxMembers" INTEGER NOT NULL,
    "maxBranches" INTEGER NOT NULL,
    "maxVehicles" INTEGER,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "yearlyPrice" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE,
    "status" "SubscriptionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_permissions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "plan_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_brands" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_versions" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "production_from" INTEGER,
    "production_to" INTEGER,
    "engine_code" TEXT,
    "engine_displacement" INTEGER,
    "horsepower" INTEGER,
    "fuelType" "FuelType" NOT NULL,
    "transmission" "TransmissionType" NOT NULL,
    "bodyType" "BodyType" NOT NULL,
    "doors" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_photos" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_documents" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "document_type" VARCHAR(50) NOT NULL,
    "url" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "version_id" UUID,
    "license_plate" VARCHAR(20) NOT NULL,
    "vin" VARCHAR(100),
    "engine_number" TEXT,
    "manufacture_year" INTEGER,
    "model_year" INTEGER,
    "color" VARCHAR(50),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_mileages" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "recorded_by_user_id" UUID,
    "recorded_by_member_id" UUID,
    "mileage" INTEGER NOT NULL,
    "source" "MileageSource" NOT NULL,
    "notes" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_mileages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_ownerships" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "OwnershipType" NOT NULL DEFAULT 'owner',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "acquired_by_transfer_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_transfers" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_accesses" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by_user_id" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_access_permissions" (
    "id" UUID NOT NULL,
    "vehicle_access_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "vehicle_access_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_shares" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxViews" INTEGER,
    "currentViews" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_transfer_events" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "type" "VehicleTransferEventType" NOT NULL,
    "performed_by_user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_transfer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_share_permissions" (
    "id" UUID NOT NULL,
    "vehicle_share_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "vehicle_share_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_mfas_user_id_key" ON "user_mfas"("user_id");

-- CreateIndex
CREATE INDEX "login_history_user_id_idx" ON "login_history"("user_id");

-- CreateIndex
CREATE INDEX "login_history_logged_in_at_idx" ON "login_history"("logged_in_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_credentials_user_id_key" ON "user_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_key" ON "user_sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_key" ON "email_verifications"("token");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_user_id_key" ON "oauth_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workshops_tax_id_key" ON "workshops"("tax_id");

-- CreateIndex
CREATE INDEX "workshops_name_idx" ON "workshops"("name");

-- CreateIndex
CREATE INDEX "workshop_branches_workshop_id_idx" ON "workshop_branches"("workshop_id");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_roles_workshop_id_code_key" ON "workshop_roles"("workshop_id", "code");

-- CreateIndex
CREATE INDEX "workshop_members_user_id_idx" ON "workshop_members"("user_id");

-- CreateIndex
CREATE INDEX "workshop_members_role_id_idx" ON "workshop_members"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_members_workshop_id_user_id_key" ON "workshop_members"("workshop_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_invitations_token_key" ON "workshop_invitations"("token");

-- CreateIndex
CREATE INDEX "workshop_invitations_email_idx" ON "workshop_invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_resource_action_key" ON "permissions"("module", "resource", "action");

-- CreateIndex
CREATE INDEX "workshop_role_permissions_permission_id_idx" ON "workshop_role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_role_permissions_role_id_permission_id_key" ON "workshop_role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_roles_type_key" ON "system_roles"("type");

-- CreateIndex
CREATE INDEX "system_role_assignments_user_id_idx" ON "system_role_assignments"("user_id");

-- CreateIndex
CREATE INDEX "system_role_assignments_role_id_idx" ON "system_role_assignments"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_role_assignments_user_id_role_id_key" ON "system_role_assignments"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "system_role_permissions_permission_id_idx" ON "system_role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_role_permissions_role_id_permission_id_key" ON "system_role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_hours_branch_id_weekday_key" ON "business_hours"("branch_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "business_hour_exceptions_branch_id_date_key" ON "business_hour_exceptions"("branch_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_code_key" ON "specialties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_specialties_workshop_id_specialty_id_key" ON "workshop_specialties"("workshop_id", "specialty_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_workshop_id_idx" ON "subscriptions"("workshop_id");

-- CreateIndex
CREATE INDEX "plan_permissions_permission_id_idx" ON "plan_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_permissions_plan_id_permission_id_key" ON "plan_permissions"("plan_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_brands_name_key" ON "vehicle_brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_brands_slug_key" ON "vehicle_brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_brand_id_slug_key" ON "vehicle_models"("brand_id", "slug");

-- CreateIndex
CREATE INDEX "vehicle_photos_vehicle_id_idx" ON "vehicle_photos"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_documents_vehicle_id_idx" ON "vehicle_documents"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_license_plate_key" ON "vehicles"("license_plate");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_engine_number_key" ON "vehicles"("engine_number");

-- CreateIndex
CREATE INDEX "vehicles_license_plate_idx" ON "vehicles"("license_plate");

-- CreateIndex
CREATE INDEX "vehicle_mileages_vehicle_id_recorded_at_idx" ON "vehicle_mileages"("vehicle_id", "recorded_at");

-- CreateIndex
CREATE INDEX "vehicle_mileages_vehicle_id_mileage_idx" ON "vehicle_mileages"("vehicle_id", "mileage");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_vehicle_id_idx" ON "vehicle_ownerships"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_user_id_idx" ON "vehicle_ownerships"("user_id");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_starts_at_idx" ON "vehicle_ownerships"("starts_at");

-- CreateIndex
CREATE INDEX "vehicle_transfers_vehicle_id_idx" ON "vehicle_transfers"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_transfers_status_idx" ON "vehicle_transfers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_accesses_vehicle_id_user_id_key" ON "vehicle_accesses"("vehicle_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_access_permissions_vehicle_access_id_permission_id_key" ON "vehicle_access_permissions"("vehicle_access_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_shares_token_key" ON "vehicle_shares"("token");

-- CreateIndex
CREATE INDEX "vehicle_shares_token_idx" ON "vehicle_shares"("token");

-- CreateIndex
CREATE INDEX "vehicle_transfer_events_transfer_id_idx" ON "vehicle_transfer_events"("transfer_id");

-- CreateIndex
CREATE INDEX "vehicle_transfer_events_type_idx" ON "vehicle_transfer_events"("type");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_share_permissions_vehicle_share_id_permission_id_key" ON "vehicle_share_permissions"("vehicle_share_id", "permission_id");

-- AddForeignKey
ALTER TABLE "user_mfas" ADD CONSTRAINT "user_mfas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_branches" ADD CONSTRAINT "workshop_branches_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_roles" ADD CONSTRAINT "workshop_roles_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_members" ADD CONSTRAINT "workshop_members_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_members" ADD CONSTRAINT "workshop_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_members" ADD CONSTRAINT "workshop_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "workshop_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_members" ADD CONSTRAINT "workshop_members_default_branch_id_fkey" FOREIGN KEY ("default_branch_id") REFERENCES "workshop_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_invitations" ADD CONSTRAINT "workshop_invitations_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_invitations" ADD CONSTRAINT "workshop_invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "workshop_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_invitations" ADD CONSTRAINT "workshop_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_role_permissions" ADD CONSTRAINT "workshop_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "workshop_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_role_permissions" ADD CONSTRAINT "workshop_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_assignments" ADD CONSTRAINT "system_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_assignments" ADD CONSTRAINT "system_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "system_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_permissions" ADD CONSTRAINT "system_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "system_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_permissions" ADD CONSTRAINT "system_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "workshop_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_hour_exceptions" ADD CONSTRAINT "business_hour_exceptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "workshop_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_specialties" ADD CONSTRAINT "workshop_specialties_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_specialties" ADD CONSTRAINT "workshop_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_permissions" ADD CONSTRAINT "plan_permissions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_permissions" ADD CONSTRAINT "plan_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "vehicle_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_versions" ADD CONSTRAINT "vehicle_versions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "vehicle_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_mileages" ADD CONSTRAINT "vehicle_mileages_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_mileages" ADD CONSTRAINT "vehicle_mileages_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_mileages" ADD CONSTRAINT "vehicle_mileages_recorded_by_member_id_fkey" FOREIGN KEY ("recorded_by_member_id") REFERENCES "workshop_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_acquired_by_transfer_id_fkey" FOREIGN KEY ("acquired_by_transfer_id") REFERENCES "vehicle_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_accesses" ADD CONSTRAINT "vehicle_accesses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_accesses" ADD CONSTRAINT "vehicle_accesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_accesses" ADD CONSTRAINT "vehicle_accesses_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_access_permissions" ADD CONSTRAINT "vehicle_access_permissions_vehicle_access_id_fkey" FOREIGN KEY ("vehicle_access_id") REFERENCES "vehicle_accesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_access_permissions" ADD CONSTRAINT "vehicle_access_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_shares" ADD CONSTRAINT "vehicle_shares_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_shares" ADD CONSTRAINT "vehicle_shares_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfer_events" ADD CONSTRAINT "vehicle_transfer_events_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "vehicle_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transfer_events" ADD CONSTRAINT "vehicle_transfer_events_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_share_permissions" ADD CONSTRAINT "vehicle_share_permissions_vehicle_share_id_fkey" FOREIGN KEY ("vehicle_share_id") REFERENCES "vehicle_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_share_permissions" ADD CONSTRAINT "vehicle_share_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
