-- CreateEnum
CREATE TYPE "CareEpisodeAttachmentPhase" AS ENUM ('before', 'work', 'after');

-- CreateEnum
CREATE TYPE "CareEpisodeAttachmentRemovalReason" AS ENUM ('duplicada', 'sin_valor', 'privacidad', 'otro');

-- CreateTable
CREATE TABLE "care_episode_attachments" (
    "id" UUID NOT NULL,
    "care_episode_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(50) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "caption" VARCHAR(500),
    "phase" "CareEpisodeAttachmentPhase",
    "uploaded_by_user_id" UUID,
    "uploaded_by_member_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "removed_by_user_id" UUID,
    "removed_by_member_id" UUID,
    "removed_reason" "CareEpisodeAttachmentRemovalReason",

    CONSTRAINT "care_episode_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "care_episode_attachments_key_key" ON "care_episode_attachments"("key");

-- CreateIndex
CREATE INDEX "care_episode_attachments_care_episode_id_phase_idx" ON "care_episode_attachments"("care_episode_id", "phase");

-- AddForeignKey
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_care_episode_id_fkey" FOREIGN KEY ("care_episode_id") REFERENCES "care_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_uploaded_by_member_id_fkey" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "workshop_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_removed_by_user_id_fkey" FOREIGN KEY ("removed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_removed_by_member_id_fkey" FOREIGN KEY ("removed_by_member_id") REFERENCES "workshop_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- CHECKs manuales (M2 / D-DB-1): Prisma no los gestiona en el diff del schema.
-- ===========================================================================

-- Uploader exclusivo: o bien User o bien WorkshopMember, nunca ambos.
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_uploader_no_both" CHECK (
    NOT ("uploaded_by_user_id" IS NOT NULL AND "uploaded_by_member_id" IS NOT NULL)
);

-- Un adjunto activo (no removido) siempre tiene uploader registrado.
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_active_uploader_required" CHECK (
    "removed_at" IS NOT NULL OR "uploaded_by_user_id" IS NOT NULL OR "uploaded_by_member_id" IS NOT NULL
);

-- Si hubo remoción, debe registrarse el remover (User o WorkshopMember).
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_removal_shape_1" CHECK (
    "removed_at" IS NULL OR "removed_by_user_id" IS NOT NULL OR "removed_by_member_id" IS NOT NULL
);

-- Remover exclusivo: solo tiene sentido si hubo remoción.
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_removal_shape_2" CHECK (
    "removed_at" IS NOT NULL OR ("removed_by_user_id" IS NULL AND "removed_by_member_id" IS NULL)
);

-- El tamaño del adjunto debe ser positivo.
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_size_positive" CHECK (
    "size_bytes" > 0
);

-- Whitelist de MIME types permitidos para evidencia (imágenes).
ALTER TABLE "care_episode_attachments" ADD CONSTRAINT "care_episode_attachments_mime_whitelist" CHECK (
    "mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
);
