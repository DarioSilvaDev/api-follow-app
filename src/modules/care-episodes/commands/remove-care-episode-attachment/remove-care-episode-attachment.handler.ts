import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CareEpisodeAttachmentRemovalReason } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import {
  CareEpisodeAttachmentRemovedAudit,
  CareEpisodeAttachmentRemovedEvent,
} from '../../events/care-episode-attachment-removed.event';
import { RemoveCareEpisodeAttachmentCommand } from './remove-care-episode-attachment.command';

/**
 * RemoveCareEpisodeAttachmentHandler — Borrado lógico auditable (S5,
 * DELETE /:id/attachments/:attachmentId).
 *
 * La fila SIEMPRE se preserva (removedAt/removedBy/removedReason); jamás
 * delete físico. Identity se deriva del contexto activo, nunca del body.
 *
 * Algoritmo ordenado (precedencia: frozen > reason > uploader identity):
 *   GATE 0 — super_admin: permite con auditoría; removedBy según contexto;
 *            removedReason opcional (INFO). Salta al resto de gates.
 *   GATE 1 — FROZEN: verified || cancelled → 409 (todo actor excepto super_admin).
 *   GATE 2 — identidad:
 *     a. uploader self-removal (contexto exacto USER o MEMBER) → OK sin razón
 *        (removedReason forzado a null).
 *     b. dueño actual quitando subida de propietario → OK SOLO con razón;
 *        evidencia del taller (uploadedByMemberId) → 403 "El propietario...".
 *     c. WORKSHOP del episodio: evidencia de miembro inactivo → OK con razón
 *        (audit de limpieza).
 *     d. resto → 403.
 * Blob: storage.delete best-effort DESPUÉS del void; si falla, log (no revert).
 * Evento: emitido DESPUÉS del intento de borrado del blob, con rol de auditoría.
 */
@Injectable()
export class RemoveCareEpisodeAttachmentHandler {
  private readonly logger = new Logger(RemoveCareEpisodeAttachmentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleAccessService: VehicleAccessService,
    private readonly storage: StorageR2Service,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: RemoveCareEpisodeAttachmentCommand): Promise<void> {
    const { careEpisodeId, attachmentId, removedReason, ctx, user } = command;

    const attachment = await this.prisma.careEpisodeAttachment.findFirst({
      where: { id: attachmentId, careEpisodeId },
      select: {
        id: true,
        key: true,
        uploadedByUserId: true,
        uploadedByMemberId: true,
        removedAt: true,
        careEpisode: {
          select: {
            id: true,
            vehicleId: true,
            workshopId: true,
            status: true,
            verification: true,
            source: true,
          },
        },
      },
    });
    if (!attachment) {
      throw new NotFoundException('CareEpisodeAttachment', attachmentId);
    }
    const episode = attachment.careEpisode;

    // ── Contextos soportados (DEALERSHIP/PLATFORM no tienen path en S5) ──
    if (ctx.type !== 'PERSONAL' && ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException(
        'Esta operación requiere un contexto PERSONAL o WORKSHOP',
      );
    }

    // WORKSHOP de otro episodio → 404 (no revelar existencia).
    if (ctx.type === 'WORKSHOP' && episode.workshopId !== ctx.workshopId) {
      throw new NotFoundException('CareEpisodeAttachment', attachmentId);
    }

    // Idempotencia explícita: doble void no es 204 silencioso.
    if (attachment.removedAt) {
      throw new ConflictException('Este adjunto ya fue eliminado');
    }

    const removedAt = new Date();

    // Actor desde el contexto activo SOLO.
    const removedByUserId = ctx.type === 'PERSONAL' ? ctx.userId : null;
    const removedByMemberId = ctx.type === 'WORKSHOP' ? ctx.memberId : null;

    // ── GATE 0: super_admin ──
    if (await this.isSuperAdmin(user.id)) {
      const finalReason = removedReason ?? null;
      await this.voidAttachment(
        attachment.id,
        removedByUserId,
        removedByMemberId,
        finalReason,
        removedAt,
      );
      await this.deleteBlobBestEffort(attachment.key);
      this.emitRemoved(attachment, {
        removedByUserId,
        removedByMemberId,
        removedReason: finalReason,
        removedAt,
        audit: 'super_admin',
      });
      return;
    }

    // ── GATE 1: FROZEN ──
    if (episode.verification === 'verified' || episode.status === 'cancelled') {
      throw new ConflictException(
        'Episodio cerrado; no se pueden eliminar evidencias',
      );
    }

    // ── GATE 2: identidad ──
    let audit: CareEpisodeAttachmentRemovedAudit | null = null;
    let reasonRequired = false;

    // a. Uploader self-removal (contexto exacto).
    if (
      ctx.type === 'PERSONAL' &&
      attachment.uploadedByUserId === user.id &&
      attachment.uploadedByMemberId === null
    ) {
      audit = 'uploader';
    } else if (
      ctx.type === 'WORKSHOP' &&
      attachment.uploadedByMemberId === ctx.memberId
    ) {
      audit = 'uploader';
    }

    // c. Limpieza de huérfano: taller del episodio + evidencia de miembro
    //    que ya no es miembro activo del taller.
    if (
      !audit &&
      ctx.type === 'WORKSHOP' &&
      episode.workshopId === ctx.workshopId &&
      attachment.uploadedByMemberId !== null
    ) {
      const uploader = await this.prisma.workshopMember.findUnique({
        where: { id: attachment.uploadedByMemberId },
        select: { workshopId: true, status: true },
      });
      if (
        !uploader ||
        uploader.workshopId !== ctx.workshopId ||
        uploader.status !== 'active'
      ) {
        audit = 'workshop_cleanup';
        reasonRequired = true;
      }
    }

    // Evidencia del taller alcanzada sin rol de limpieza.
    if (!audit && attachment.uploadedByMemberId !== null) {
      if (ctx.type === 'PERSONAL') {
        throw new ForbiddenException(
          'El propietario no puede eliminar evidencias del taller',
        );
      }
      throw new ForbiddenException(
        'No tienes permiso para eliminar esta evidencia',
      );
    }

    // b. Dueño actual quitando subida de propietario (no self).
    if (!audit && attachment.uploadedByUserId !== null) {
      try {
        await this.vehicleAccessService.assertOwnership({
          vehicleId: episode.vehicleId,
          user,
        });
      } catch {
        throw new ForbiddenException(
          'No tienes permiso para eliminar esta evidencia',
        );
      }
      audit = 'current_owner';
      reasonRequired = true;
    }

    if (!audit) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar esta evidencia',
      );
    }

    // ── Razón obligatoria / nula según audit path ──
    let finalReason: CareEpisodeAttachmentRemovalReason | null = null;
    if (audit === 'uploader') {
      // Diseño S5: self-removal sin razón (removedReason null).
      finalReason = null;
    } else if (reasonRequired) {
      if (!removedReason) {
        throw new BadRequestException(
          'removedReason es requerido para esta eliminación',
        );
      }
      finalReason = removedReason;
    }

    await this.voidAttachment(
      attachment.id,
      removedByUserId,
      removedByMemberId,
      finalReason,
      removedAt,
    );

    // Blob best-effort DESPUÉS del void (no revertir si falla).
    await this.deleteBlobBestEffort(attachment.key);

    this.emitRemoved(attachment, {
      removedByUserId,
      removedByMemberId,
      removedReason: finalReason,
      removedAt,
      audit,
    });
  }

  private async voidAttachment(
    attachmentId: string,
    removedByUserId: string | null,
    removedByMemberId: string | null,
    removedReason: CareEpisodeAttachmentRemovalReason | null,
    removedAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.careEpisodeAttachment.update({
        where: { id: attachmentId },
        data: {
          removedAt,
          removedByUserId,
          removedByMemberId,
          removedReason,
        },
      });
    });
  }

  private async deleteBlobBestEffort(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (err) {
      // Evidence voided queda vigente; se loguea para limpieza manual.
      this.logger.error(
        `Blob delete failed for ${key}; evidence stays voided: ${(err as Error).message}`,
      );
    }
  }

  private emitRemoved(
    attachment: {
      id: string;
      key: string;
      careEpisode: { id: string; vehicleId: string };
    },
    ctx: {
      removedByUserId: string | null;
      removedByMemberId: string | null;
      removedReason: CareEpisodeAttachmentRemovalReason | null;
      removedAt: Date;
      audit: CareEpisodeAttachmentRemovedAudit;
    },
  ): void {
    this.eventEmitter.emit(
      'care-episode.attachment.removed',
      new CareEpisodeAttachmentRemovedEvent({
        attachmentId: attachment.id,
        careEpisodeId: attachment.careEpisode.id,
        vehicleId: attachment.careEpisode.vehicleId,
        key: attachment.key,
        removedByMemberId: ctx.removedByMemberId,
        removedByUserId: ctx.removedByUserId,
        removedReason: ctx.removedReason,
        removedAt: ctx.removedAt,
        audit: ctx.audit,
      }),
    );
  }

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const superAdmin = await this.prisma.systemRole.findUnique({
      where: { type: 'super_admin' },
      select: { id: true },
    });
    if (!superAdmin) return false;
    const hasRole = await this.prisma.systemRoleAssignment.findFirst({
      where: { userId, roleId: superAdmin.id },
      select: { id: true },
    });
    return !!hasRole;
  }
}