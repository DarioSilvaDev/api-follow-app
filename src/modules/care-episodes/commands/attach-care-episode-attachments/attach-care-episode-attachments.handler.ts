import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CareEpisodeAttachment } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import { CareEpisodeAttachmentAddedEvent } from '../../events/care-episode-attachment-added.event';
import { AttachCareEpisodeAttachmentsCommand } from './attach-care-episode-attachments.command';

export const MAX_ACTIVE_ATTACHMENTS = 15;

interface EpisodeState {
  source: string;
  status: string;
  verification: string;
}

/**
 * AttachCareEpisodeAttachmentsHandler — Adjunta una evidencia a un episodio
 * de taller (S4, POST /:id/attachments). Archivo único por request
 * (FileInterceptor('files') aprobado en el diseño), carpeta
 * `care-episodes/<episodeId>` en R2.
 *
 * Flujo:
 *   1. findFirst({ id, workshopId: ctx.workshopId }) → 404 (sin revelar).
 *   2. Puerta de estado: source !== 'workshop' → 403;
 *      delivered/cancelled/verified → 409.
 *   3. Subida a storage (R2 re-encoda a WebP 1920px).
 *   4. Transacción con SELECT ... FOR UPDATE sobre care_episodes: re-chequeo
 *      de estado Y conteo de activos (<= 15); si cambió/cap → compensación
 *      (borrar blob) + 409.
 *   5. Tras el commit: UN evento CareEpisodeAttachmentAddedEvent por adjunto.
 */
@Injectable()
export class AttachCareEpisodeAttachmentsHandler {
  private readonly logger = new Logger(AttachCareEpisodeAttachmentsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageR2Service,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: AttachCareEpisodeAttachmentsCommand) {
    const { careEpisodeId, workshopId, memberId, phase, caption, file } =
      command;

    const episode = await this.prisma.careEpisode.findFirst({
      where: { id: careEpisodeId, workshopId },
      select: {
        id: true,
        vehicleId: true,
        workshopId: true,
        status: true,
        source: true,
        verification: true,
      },
    });
    if (!episode) {
      throw new NotFoundException('CareEpisode', careEpisodeId);
    }
    this.assertWritableState(episode);

    // ── Upload a storage (carpeta del episodio) ──
    const uploaded = await this.storage.upload(
      file,
      `care-episodes/${careEpisodeId}`,
    );

    let created!: CareEpisodeAttachment;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Lock de fila: serializa attaches concurrentes contra el techo de 15.
        const lockedRows = await tx.$queryRaw<
          Array<{
            status: string;
            source: string;
            verification: string;
            workshop_id: string;
          }>
        >`SELECT status, source, verification, workshop_id FROM care_episodes WHERE id = ${careEpisodeId} FOR UPDATE`;

        const locked = lockedRows[0];
        if (!locked || locked.workshop_id !== workshopId) {
          // El estado cambió desde el chequeo previo → compensar + 404.
          throw new NotFoundException('CareEpisode', careEpisodeId);
        }
        this.assertWritableState(locked);

        const activeCount = await tx.careEpisodeAttachment.count({
          where: { careEpisodeId, removedAt: null },
        });
        if (activeCount + 1 > MAX_ACTIVE_ATTACHMENTS) {
          throw new ConflictException(
            'Este episodio alcanzó el máximo de 15 imágenes; eliminá alguna antes de subir más',
          );
        }

        created = await tx.careEpisodeAttachment.create({
          data: {
            careEpisodeId,
            key: uploaded.key,
            originalName: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            caption,
            phase,
            // Identity SIEMPRE desde el contexto, jamás desde el body.
            uploadedByMemberId: memberId,
            uploadedByUserId: null,
          },
        });
      });
    } catch (err) {
      // Compensación: si algo falló antes del commit, borrar el blob subido.
      try {
        await this.storage.delete(uploaded.key);
      } catch (cleanupErr) {
        this.logger.error(
          `Cleanup failed for blob ${uploaded.key}: ${(cleanupErr as Error).message}`,
        );
      }
      throw err;
    }

    // Evento DESPUÉS del commit (por adjunto).
    this.eventEmitter.emit(
      'care-episode.attachment.added',
      new CareEpisodeAttachmentAddedEvent({
        attachmentId: created.id,
        careEpisodeId,
        vehicleId: episode.vehicleId,
        key: created.key,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        // phase viene validado en el DTO (@IsIn) y la columna es non-null;
        // se usa command.phase (no nullable) para preservar el tipo del evento.
        phase: command.phase,
        uploadedByMemberId: created.uploadedByMemberId,
        uploadedByUserId: created.uploadedByUserId,
        createdAt: created.createdAt,
      }),
    );

    return {
      id: created.id,
      key: created.key,
      originalName: created.originalName,
      mimeType: created.mimeType,
      sizeBytes: created.sizeBytes,
      caption: created.caption,
      phase: created.phase,
      uploadedByMemberId: created.uploadedByMemberId,
      uploadedByUserId: created.uploadedByUserId,
      removed: false,
      createdAt: created.createdAt,
    };
  }

  private assertWritableState(episode: EpisodeState): void {
    if (episode.source !== 'workshop') {
      // Episodios owner no admiten adjuntos post-creación.
      throw new ForbiddenException(
        'Los episodios registrados por el propietario no admiten evidencia posterior',
      );
    }
    if (
      episode.status === 'delivered' ||
      episode.status === 'cancelled' ||
      episode.verification === 'verified'
    ) {
      throw new ConflictException(
        'Episodio cerrado/verificado; no se pueden agregar evidencias',
      );
    }
  }
}