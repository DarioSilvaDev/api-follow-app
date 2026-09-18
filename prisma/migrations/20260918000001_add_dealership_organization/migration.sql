-- Fase 1a consignación — M1 (D-102 / D-TL-8 / D-DB-2)
-- Tablas de la organización "Dealership" (espejo del patrón Workshop):
-- dealerships, dealership_roles, dealership_members, dealership_invitations,
-- dealership_role_permissions. Sucursales/specialties fuera del MVP.
-- Migración ADITIVA: no toca tablas existentes ni el índice D-079.

-- CreateTable
CREATE TABLE "dealerships" (
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

    CONSTRAINT "dealerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealership_roles" (
    "id" UUID NOT NULL,
    "dealership_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealership_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealership_members" (
    "id" UUID NOT NULL,
    "dealership_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL,
    "left_at" TIMESTAMP(3),
    "invited_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "last_access_at" TIMESTAMP(3),
    "status" "MemberStatus" NOT NULL,

    CONSTRAINT "dealership_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealership_invitations" (
    "id" UUID NOT NULL,
    "dealership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "invited_by" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "status" "InvitationStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealership_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealership_role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "dealership_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dealerships_tax_id_key" ON "dealerships"("tax_id");

-- CreateIndex
CREATE INDEX "dealerships_name_idx" ON "dealerships"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dealership_roles_dealership_id_code_key" ON "dealership_roles"("dealership_id", "code");

-- CreateIndex
CREATE INDEX "dealership_members_user_id_idx" ON "dealership_members"("user_id");

-- CreateIndex
CREATE INDEX "dealership_members_role_id_idx" ON "dealership_members"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealership_members_dealership_id_user_id_key" ON "dealership_members"("dealership_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealership_invitations_token_key" ON "dealership_invitations"("token");

-- CreateIndex
CREATE INDEX "dealership_invitations_email_idx" ON "dealership_invitations"("email");

-- CreateIndex
CREATE INDEX "dealership_role_permissions_permission_id_idx" ON "dealership_role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealership_role_permissions_role_id_permission_id_key" ON "dealership_role_permissions"("role_id", "permission_id");

-- AddForeignKey
ALTER TABLE "dealership_roles" ADD CONSTRAINT "dealership_roles_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealership_members" ADD CONSTRAINT "dealership_members_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealership_members" ADD CONSTRAINT "dealership_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealership_members" ADD CONSTRAINT "dealership_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "dealership_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealership_invitations" ADD CONSTRAINT "dealership_invitations_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealership_invitations" ADD CONSTRAINT "dealership_invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "dealership_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealership_invitations" ADD CONSTRAINT "dealership_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealership_role_permissions" ADD CONSTRAINT "dealership_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "dealership_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealership_role_permissions" ADD CONSTRAINT "dealership_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;