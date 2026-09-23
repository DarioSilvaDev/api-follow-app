import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import type { CareEpisode, CareEpisodeAttachment } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import type { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import { CareEpisodeAttachmentItem } from '../../dto/care-episode-detail-response.dto';
import { MAX_OWNER_CREATION_FILES } from '../../dto/create-owner-care-episode.dto';
import { CareEpisodeCreatedEvent } from '../../events/care-episode-created.event';
import { CreateOwnerCareEpisodeCommand } from './create-owner-care-episode.command';

interface UploadedEvidence {
  key: string;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * CreateOwnerCareEpisodeHandler — Registro de un servicio por el propietario.
 *
 * Iteración 2-2 / RF-1 (D-062 amendando D-024 A2 parcialmente). Ruta OWNER:
 *   - Exige contexto PERSONAL (D-063: el source se deriva del contexto,
 *     jamás del body; esta ruta es OWNER por definición).
 *   - Exige `assertOwnership` sobre el vehículo (404 inexistente / 403 no owned).
 *   - serviceDate no futura (comparación contra fin de día UTC actual).
 *   - Taller responsable XOR: workshopId (taller de la app, activo) o texto libre.
 *   - Persiste source='owner', status='delivered', verification='unverified'.
 *
 * S6 (evidencia al crear): la ruta es DUAL — JSON conserva 100% el flujo
 * histórico; multipart/form-data aporta imágenes opcionales (máx. 5,
 * campo `files`) y `captions` index-matched:
 *   1. Validaciones/ownership idénticas ANTES de tocar storage.
 *   2. `episodeId = uuid()` se genera AQUÍ (las keys de storage nacen bajo
 *      `care-episodes/<episodeId>/<uuid>.webp`).
 *   3. Upload de cada blob a esa carpeta vía StorageR2Service.
 *   4. Create del episodio + attachments en UNA transacción (nested create;
 *      phase=null, uploadedByUserId=user.id, uploadedByMemberId=null).
 *   5. COMPENSACIÓN: si el create falla tras los uploads → delete de todos
 *      los blobs (best-effort, log) + rethrow.
 *   6. Post-commit: ÚNICO evento `care-episode.created` (E-5: el hecho
 *      agregado es la creación del episodio; NO hay `attachment.added`).
 */
@Injectable()
export class CreateOwnerCareEpisodeHandler {
  private readonly logger = new Logger(CreateOwnerCareEpisodeHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleAccessService: VehicleAccessService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storage: StorageR2Service,
  ) {}

  async execute(command: CreateOwnerCareEpisodeCommand, ctx: CurrentContext) {
    // RF-1: el handler exige contexto PERSONAL (la ruta /owner es OWNER por
    // definición — D-063). WORKSHOP/PLATFORM → 403.
    if (ctx.type !== 'PERSONAL') {
      throw new ForbiddenException(
        'Owner care episodes can only be created in a PERSONAL context',
      );
    }

    const { dto, user, files } = command;
    const {
      vehicleId,
      title,
      serviceDate,
      workshopId,
      workshopName,
      mileageIn,
      notes,
    } = dto;

    // ── serviceDate: requerido y no futura (fin de día UTC actual) ──
    const serviceDateValue = new Date(serviceDate);
    if (Number.isNaN(serviceDateValue.getTime())) {
      throw new BadRequestException('serviceDate must be a valid date');
    }
    const endOfUtcDay = new Date();
    endOfUtcDay.setUTCHours(23, 59, 59, 999);
    if (serviceDateValue.getTime() > endOfUtcDay.getTime()) {
      throw new BadRequestException('serviceDate cannot be in the future');
    }

    // ── XOR taller responsable: workshopId XOR workshopName ──
    const hasWorkshopId = workshopId !== undefined;
    const hasWorkshopName = workshopName !== undefined;
    if (hasWorkshopId === hasWorkshopName) {
      throw new BadRequestException(
        'Provide exactly one of workshopId (app workshop) or workshopName (free text)',
      );
    }

    // ── Vehículo: 404 si no existe; 403 si no es owned (assertOwnership) ──
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle', vehicleId);
    }
    await this.vehicleAccessService.assertOwnership({ vehicleId, user });

    // ── workshopId (si viene): debe existir y estar activo → 404 ──
    let effectiveWorkshopId: string | null = null;
    let effectiveWorkshopName: string | null = null;
    if (hasWorkshopId) {
      const workshop = await this.prisma.workshop.findFirst({
        where: { id: workshopId, isActive: true },
        select: { id: true },
      });
      if (!workshop) {
        throw new NotFoundException('Workshop', workshopId);
      }
      effectiveWorkshopId = workshopId;
    } else {
      effectiveWorkshopName = workshopName ?? null;
    }

    // ── S6: evidencia opcional (máx. 5; multer ya aplica límites, defensa en
    //    profundidad aquí para que el handler sea determinista en tests) ──
    const evidenceFiles = files ?? [];
    if (evidenceFiles.length > MAX_OWNER_CREATION_FILES) {
      throw new BadRequestException(
        'Max 5 evidence files per owner service record',
      );
    }

    // ── episodeId se genera AQUÍ (antes de subir): las keys de storage quedan
    //    bajo una carpeta con el id final del episodio (S6). ──
    const episodeId = uuid();
    const uploaded: UploadedEvidence[] = [];
    const captions = dto.captions ?? [];

    let careEpisode!: CareEpisode & { attachments: CareEpisodeAttachment[] };

    try {
      // ── Uploads a storage ──
      for (const file of evidenceFiles) {
        const result = await this.storage.upload(
          file,
          `care-episodes/${episodeId}`,
        );
        uploaded.push({
          key: result.key,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        });
      }

      // ── Persist (RF-1: nacimiento owner = delivered + unverified).
      //    Episodio + attachments en UNA transacción (nested create, S6). ──
      careEpisode = await this.prisma.careEpisode.create({
        data: {
          id: episodeId,
          vehicleId,
          source: 'owner',
          status: 'delivered',
          verification: 'unverified',
          title,
          serviceDate: serviceDateValue,
          mileageIn: mileageIn ?? null,
          customerNotes: notes ?? null,
          workshopId: effectiveWorkshopId,
          workshopName: effectiveWorkshopName,
          createdByUserId: user.id,
          checkedInAt: null,
          createdByMemberId: null,
          branchId: null,
          // Identity SIEMPRE desde el contexto/handler, jamás del body.
          ...(uploaded.length > 0
            ? {
                attachments: {
                  create: uploaded.map((evidence, index) => ({
                    key: evidence.key,
                    originalName: evidence.originalname.slice(0, 255),
                    mimeType: evidence.mimetype,
                    sizeBytes: evidence.size,
                    caption: captions[index] ?? null,
                    // Propietario: sin fase (S6) — phase=null (grupo 'other'
                    // en el detalle, consistente con S1).
                    phase: null,
                    uploadedByUserId: user.id,
                    uploadedByMemberId: null,
                  })),
                },
              }
            : {}),
        },
        include: { attachments: true },
      });
    } catch (err) {
      // ── COMPENSACIÓN (S6): si algo falló tras los uploads (fallo de DB,
      //    validación posterior, etc.), borrar TODOS los blobs subidos. ──
      for (const evidence of uploaded) {
        try {
          await this.storage.delete(evidence.key);
        } catch (cleanupErr) {
          this.logger.error(
            `Cleanup failed for blob ${evidence.key}: ${(cleanupErr as Error).message}`,
          );
        }
      }
      throw err;
    }

    // ── Evento: emitido después del éxito (payload extendido, D-063).
    //    ÚNICO evento por creación (E-5): NO se emiten `attachment.added`
    //    individuales — el hecho agregado es `care-episode.created`. ──
    this.eventEmitter.emit(
      'care-episode.created',
      new CareEpisodeCreatedEvent(
        careEpisode.id,
        vehicleId,
        'owner',
        effectiveWorkshopId,
        null,
        user.id,
      ),
    );

    // ── Response: contrato histórico INTACTO (el raw del episodio) + adjuntos
    //    en la misma forma `CareEpisodeAttachmentItem` del detalle (S1),
    //    ADITIVO para que el frontend pueda confirmar la evidencia creada. ──
    return {
      ...careEpisode,
      attachments: careEpisode.attachments.map((a) =>
        this.toAttachmentItem(a),
      ),
      attachmentCount: careEpisode.attachments.length,
    };
  }

  private toAttachmentItem(a: CareEpisodeAttachment): CareEpisodeAttachmentItem {
    return {
      id: a.id,
      key: a.key,
      originalName: a.originalName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      caption: a.caption,
      phase: a.phase,
      uploadedByMemberId: a.uploadedByMemberId,
      uploadedByUserId: a.uploadedByUserId,
      removed: a.removedAt !== null,
      createdAt: a.createdAt,
    };
  }
}