import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type {
  CareEpisodeAttachment,
  VehicleContactStatus,
} from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../../../common/database/prisma.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { buildE164, maskPhone } from '../../../../common/phone/phone.util';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import { envs } from '../../../../config/envs';
import { VehicleRegisteredEvent } from '../../../vehicles/events/vehicle-registered.event';
import { CareEpisodeCreatedEvent } from '../../events/care-episode-created.event';
import { CareEpisodeAttachmentItem } from '../../dto/care-episode-detail-response.dto';
import {
  MAX_CHECK_IN_FILES,
  MAX_CHECK_IN_SERVICE_TYPES,
} from '../../dto/check-in.dto';
import { CheckInCommand } from './check-in.command';

interface PreparedVehicleData {
  versionId: string | null;
  brandName: string | null;
  modelName: string | null;
}

interface UploadedEvidence {
  key: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface CheckInData {
  careEpisodeId: string;
  vehicleId: string;
  licensePlate: string;
  status: string;
  mileageIn: number | null;
  checkedInAt: Date;
  vehicleCreated: boolean;
  ownerContact: {
    status: VehicleContactStatus;
    phoneMasked: string | null;
  };
  /** Evidencia `before` creada junto al episodio (D-163 / D-170). */
  attachments: CareEpisodeAttachmentItem[];
  attachmentCount: number;
}

export interface CheckInResult {
  data: CheckInData;
}

/**
 * CheckInHandler — check-in unificado de taller (B-2 / MVP "taller primero").
 *
 * Recibe una PLACA (no `vehicleId`), resuelve si reutiliza o crea el `Vehicle`
 * y crea el `CareEpisode` abierto junto con el contacto del propietario y los
 * tipos de atención, todo dentro de UNA transacción.
 *
 * Reglas clave:
 * - La identidad (workshop/member/user) viene del contexto WORKSHOP.
 * - El odómetro de ingreso es obligatorio: valor **o** excepción "no legible"
 *   con motivo (nunca ambos, nunca ninguno). En la excepción, la foto del
 *   tablero es obligatoria (D-163).
 * - Placa existente → se reutiliza (nunca 409 por placa). Placa de un vehículo
 *   soft-deleted → 409 explícito, no se resucita.
 * - VIN ajeno o distinto del registrado → 409.
 * - Carrera de dos check-ins con la misma placa nueva: se captura el P2002 de
 *   `license_plate`, se re-lee el vehículo y se continúa con el episodio.
 *
 * Foto del tablero (D-163, ruta DUAL como POST /owner):
 *   1. Validaciones (incluida la foto obligatoria) ANTES de tocar storage.
 *   2. `episodeId` se genera aquí: las keys nacen bajo
 *      `care-episodes/<episodeId>/<uuid>.webp`.
 *   3. Upload de la foto (máx. 1) → fallo de storage = 503 (el episodio no
 *      existe todavía; el reintento del usuario es válido).
 *   4. Episodio + adjunto (`phase='before'`) en UNA transacción (nested create).
 *   5. COMPENSACIÓN: si la transacción falla tras el upload → se borra el blob
 *      (best-effort, log) y se re-lanza el error.
 */
@Injectable()
export class CheckInHandler {
  private readonly logger = new Logger(CheckInHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storage: StorageR2Service,
  ) {}

  async execute(command: CheckInCommand): Promise<CheckInResult> {
    const { dto, workshopId } = command;

    // ── Sucursal: 404 si no existe, 403 si es de otro taller ──
    const branch = await this.prisma.workshopBranch.findUnique({
      where: { id: dto.branchId },
      select: {
        id: true,
        workshopId: true,
        workshop: { select: { name: true } },
      },
    });
    if (!branch) {
      throw new NotFoundException('Branch', dto.branchId);
    }
    if (branch.workshopId !== workshopId) {
      throw new ForbiddenException(
        'Branch does not belong to the context workshop',
      );
    }

    // ── Odómetro: valor XOR excepción completa ──
    const unreadable = dto.mileageInUnreadable === true;
    const hasMileage = dto.mileageIn !== undefined && dto.mileageIn !== null;
    const unreadableReason = dto.mileageInUnreadableReason?.trim() || null;

    if (unreadable) {
      if (hasMileage) {
        throw new BadRequestException(
          'Indicá el odómetro o marcá "no se puede leer", no ambos',
        );
      }
      if (!unreadableReason) {
        throw new BadRequestException(
          'Indicá el motivo por el que no se puede leer el odómetro',
        );
      }
    } else {
      if (!hasMileage) {
        throw new BadRequestException(
          'El odómetro de ingreso es obligatorio (o marcá "no se puede leer")',
        );
      }
      if (unreadableReason) {
        throw new BadRequestException(
          'El motivo de "no legible" sólo aplica cuando marcás esa opción',
        );
      }
    }

    // ── Foto del tablero (D-163 / D-170) ──
    // La foto es obligatoria cuando el odómetro no se puede leer; cuando sí se
    // lee, se admite 1 foto `before` opcional (recomendada, nunca bloqueante).
    const evidenceFiles = command.files ?? [];
    if (evidenceFiles.length > MAX_CHECK_IN_FILES) {
      throw new BadRequestException(
        `Máximo ${MAX_CHECK_IN_FILES} foto por check-in`,
      );
    }
    if (unreadable && evidenceFiles.length === 0) {
      throw new BadRequestException(
        'Adjuntá una foto del tablero cuando el odómetro no se puede leer',
      );
    }

    // ── Tipos de atención: máximo 3 filas (catálogo + "Otro") ──
    const serviceTypeIds = Array.from(new Set(dto.serviceTypeIds ?? []));
    const customServiceLabel = dto.customServiceLabel?.trim() || null;
    if (
      serviceTypeIds.length + (customServiceLabel !== null ? 1 : 0) >
      MAX_CHECK_IN_SERVICE_TYPES
    ) {
      throw new BadRequestException(
        `Máximo ${MAX_CHECK_IN_SERVICE_TYPES} tipos de atención por atención`,
      );
    }
    if (serviceTypeIds.length > 0) {
      const existing = await this.prisma.serviceType.findMany({
        where: { id: { in: serviceTypeIds }, isActive: true },
        select: { id: true },
      });
      if (existing.length !== serviceTypeIds.length) {
        throw new BadRequestException(
          'Uno o más tipos de atención no existen o están inactivos',
        );
      }
    }

    // ── Datos de catálogo/texto libre del vehículo (sólo si se crea) ──
    const prepared = await this.resolveVehicleData(dto);

    const licensePlate = dto.licensePlate.trim().toUpperCase();
    const workshopName = branch.workshop?.name ?? null;

    // El id nace ANTES de subir para que las keys de storage queden bajo la
    // carpeta del episodio (mismo patrón que POST /owner, S6).
    const episodeId = uuid();
    const uploaded: UploadedEvidence[] = [];

    let result: CheckInData;
    try {
      await this.uploadEvidence(evidenceFiles, episodeId, uploaded);
      result = await this.persistWithRaceRetry(
        command,
        prepared,
        workshopName,
        licensePlate,
        episodeId,
        uploaded,
      );
    } catch (error) {
      // Compensación: si algo falló después de subir, no dejar blobs huérfanos.
      await this.compensateUploads(uploaded);
      throw error;
    }

    // ── Eventos post-commit (nunca antes de confirmar la persistencia) ──
    if (result.vehicleCreated) {
      this.eventEmitter.emit(
        'vehicle.registered',
        new VehicleRegisteredEvent(
          result.vehicleId,
          command.userId,
          result.licensePlate,
        ),
      );
    }
    this.eventEmitter.emit(
      'care-episode.created',
      new CareEpisodeCreatedEvent(
        result.careEpisodeId,
        result.vehicleId,
        'workshop',
        command.workshopId,
        command.memberId,
      ),
    );

    return { data: result };
  }

  /**
   * Sube la evidencia `before` del check-in (máx. 1, D-163). Un fallo del
   * storage externo no es culpa del archivo del usuario: 503 (mismo criterio
   * que S4/C-8), nunca 400. El episodio aún no existe, así que el reintento
   * del usuario es seguro.
   */
  private async uploadEvidence(
    files: Express.Multer.File[],
    episodeId: string,
    uploaded: UploadedEvidence[],
  ): Promise<void> {
    for (const file of files) {
      let stored: { key: string; url: string };
      try {
        stored = await this.storage.upload(file, `care-episodes/${episodeId}`);
      } catch (err) {
        this.logger.error(
          `[storage-upload] episodeId=${episodeId} mime=${file.mimetype} ` +
            `sizeBytes=${file.size}: ${(err as Error).message}`,
        );
        throw new ServiceUnavailableException(
          'No se pudo subir la foto; intentá nuevamente',
        );
      }
      uploaded.push({
        key: stored.key,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
    }
  }

  /**
   * Persiste con reintento ante la carrera de placa (P2002): si otro check-in
   * creó el vehículo entre el `findUnique` y el `create`, la transacción se
   * revirtió completa y se re-lee el vehículo para crear sólo el episodio.
   * El `episodeId` y la evidencia ya subida se reutilizan en el reintento.
   */
  private async persistWithRaceRetry(
    command: CheckInCommand,
    prepared: PreparedVehicleData,
    workshopName: string | null,
    licensePlate: string,
    episodeId: string,
    uploaded: UploadedEvidence[],
  ): Promise<CheckInData> {
    try {
      return await this.prisma.$transaction((tx) =>
        this.persist(
          tx,
          command,
          prepared,
          workshopName,
          licensePlate,
          episodeId,
          uploaded,
        ),
      );
    } catch (error) {
      const target = this.uniqueTarget(error);
      if (target.some((t) => t === 'license_plate' || t === 'licensePlate')) {
        const existing = await this.prisma.vehicle.findUnique({
          where: { licensePlate },
          select: { id: true },
        });
        if (!existing) {
          throw error;
        }
        return this.prisma.$transaction((tx) =>
          this.persist(
            tx,
            command,
            prepared,
            workshopName,
            licensePlate,
            episodeId,
            uploaded,
            existing.id,
          ),
        );
      }
      if (target.includes('vin')) {
        throw new ConflictException('VIN ya registrado en otro vehículo');
      }
      throw error;
    }
  }

  /** Borra (best-effort) los blobs subidos si la persistencia falló. */
  private async compensateUploads(uploaded: UploadedEvidence[]): Promise<void> {
    for (const evidence of uploaded) {
      try {
        await this.storage.delete(evidence.key);
      } catch (cleanupErr) {
        this.logger.error(
          `Cleanup failed for blob ${evidence.key}: ${(cleanupErr as Error).message}`,
        );
      }
    }
  }

  /** Proyección de adjunto consistente con el detalle (S1). */
  private toAttachmentItem(
    a: CareEpisodeAttachment,
  ): CareEpisodeAttachmentItem {
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

  /**
   * Resuelve marca/modelo/versión del vehículo a crear. Catálogo y texto libre
   * son excluyentes; la versión (si viene) gana y aporta marca + modelo.
   */
  private async resolveVehicleData(
    dto: CheckInCommand['dto'],
  ): Promise<PreparedVehicleData> {
    if (dto.versionId) {
      if (dto.brandId || dto.modelId || dto.brandName || dto.modelName) {
        throw new BadRequestException(
          'Enviá la versión o marca/modelo, no ambos',
        );
      }
      const version = await this.prisma.vehicleVersion.findUnique({
        where: { id: dto.versionId },
        select: {
          id: true,
          model: {
            select: {
              name: true,
              brand: { select: { name: true } },
            },
          },
        },
      });
      if (!version) {
        throw new BadRequestException('La versión seleccionada no existe');
      }
      return {
        versionId: version.id,
        brandName: version.model.brand.name,
        modelName: version.model.name,
      };
    }

    if (dto.brandId && dto.brandName) {
      throw new BadRequestException(
        'Enviá marca del catálogo o texto libre, no ambas',
      );
    }
    if (dto.modelId && dto.modelName) {
      throw new BadRequestException(
        'Enviá modelo del catálogo o texto libre, no ambos',
      );
    }

    let brandName = dto.brandName?.trim() || null;
    let modelName = dto.modelName?.trim() || null;

    if (dto.brandId) {
      const brand = await this.prisma.vehicleBrand.findUnique({
        where: { id: dto.brandId },
        select: { name: true },
      });
      if (!brand) {
        throw new BadRequestException('La marca seleccionada no existe');
      }
      brandName = brand.name;
    }

    if (dto.modelId) {
      const model = await this.prisma.vehicleModel.findUnique({
        where: { id: dto.modelId },
        select: {
          name: true,
          brandId: true,
          brand: { select: { name: true } },
        },
      });
      if (!model) {
        throw new BadRequestException('El modelo seleccionado no existe');
      }
      if (dto.brandId && model.brandId !== dto.brandId) {
        throw new BadRequestException(
          'El modelo no pertenece a la marca seleccionada',
        );
      }
      modelName = model.name;
      if (!brandName) brandName = model.brand.name;
    }

    return { versionId: null, brandName, modelName };
  }

  /**
   * Persiste vehículo (si hace falta) + atención + tipos + contacto + evidencia
   * `before` en la transacción abierta por `execute`. `existingVehicleId` se usa
   * en el reintento por carrera de placa para no volver a crear el vehículo.
   */
  private async persist(
    tx: Prisma.TransactionClient,
    command: CheckInCommand,
    prepared: PreparedVehicleData,
    workshopName: string | null,
    licensePlate: string,
    episodeId: string,
    uploaded: UploadedEvidence[],
    existingVehicleId?: string,
  ): Promise<CheckInData> {
    const { dto, workshopId, memberId } = command;
    const vin = dto.vin?.trim().toUpperCase() || null;

    let vehicleCreated = false;
    let vehicle: {
      id: string;
      vin: string | null;
      deletedAt: Date | null;
    };

    if (existingVehicleId) {
      const found = await tx.vehicle.findUnique({
        where: { id: existingVehicleId },
        select: { id: true, vin: true, deletedAt: true },
      });
      if (!found) {
        throw new ConflictException(
          'El vehículo está dado de baja; contactá a soporte',
        );
      }
      vehicle = found;
    } else {
      const found = await tx.vehicle.findUnique({
        where: { licensePlate },
        select: { id: true, vin: true, deletedAt: true },
      });

      if (found) {
        vehicle = found;
      } else {
        vehicle = await tx.vehicle.create({
          data: {
            licensePlate,
            vin,
            versionId: prepared.versionId,
            brandName: prepared.brandName,
            modelName: prepared.modelName,
          },
          select: { id: true, vin: true, deletedAt: true },
        });
        vehicleCreated = true;
      }
    }

    // No se resucita un vehículo dado de baja (licensePlate es @unique).
    if (vehicle.deletedAt !== null) {
      throw new ConflictException(
        'El vehículo está dado de baja; contactá a soporte',
      );
    }

    // El VIN del vehículo existente es inmutable desde el check-in.
    if (vin && vehicle.vin && vehicle.vin !== vin) {
      throw new ConflictException('VIN no coincide con el vehículo registrado');
    }

    const unreadable = dto.mileageInUnreadable === true;
    const serviceTypes = [
      ...(dto.serviceTypeIds ?? []).map((serviceTypeId) => ({
        serviceTypeId,
        customLabel: null,
      })),
      ...(dto.customServiceLabel?.trim()
        ? [{ serviceTypeId: null, customLabel: dto.customServiceLabel.trim() }]
        : []),
    ];

    const careEpisode = await tx.careEpisode.create({
      data: {
        id: episodeId,
        vehicleId: vehicle.id,
        workshopId,
        branchId: dto.branchId,
        createdByMemberId: memberId,
        status: 'open',
        source: 'workshop',
        checkedInAt: new Date(),
        mileageIn: unreadable ? null : dto.mileageIn,
        mileageInUnreadable: unreadable,
        mileageInUnreadableReason: unreadable
          ? (dto.mileageInUnreadableReason?.trim() ?? null)
          : null,
        customerComplaint: dto.customerComplaint ?? null,
        customerNotes: dto.customerNotes ?? null,
        internalNotes: dto.internalNotes ?? null,
        workshopName,
        ...(serviceTypes.length > 0
          ? { serviceTypes: { create: serviceTypes } }
          : {}),
        // Evidencia `before` en la MISMA transacción (nested create, S6).
        // Identity SIEMPRE desde el contexto, jamás del body.
        ...(uploaded.length > 0
          ? {
              attachments: {
                create: uploaded.map((evidence) => ({
                  key: evidence.key,
                  originalName: evidence.originalname.slice(0, 255),
                  mimeType: evidence.mimetype,
                  sizeBytes: evidence.size,
                  caption: null,
                  phase: 'before' as const,
                  uploadedByMemberId: memberId,
                  uploadedByUserId: null,
                })),
              },
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        mileageIn: true,
        checkedInAt: true,
        vehicleId: true,
        attachments: true,
      },
    });

    const ownerContact = await this.persistOwnerContact(
      tx,
      vehicle.id,
      memberId,
      dto.ownerPhone,
    );

    return {
      careEpisodeId: careEpisode.id,
      vehicleId: vehicle.id,
      licensePlate,
      status: careEpisode.status,
      mileageIn: careEpisode.mileageIn,
      checkedInAt: careEpisode.checkedInAt ?? new Date(),
      vehicleCreated,
      ownerContact,
      attachments: careEpisode.attachments.map((a) => this.toAttachmentItem(a)),
      attachmentCount: careEpisode.attachments.length,
    };
  }

  /**
   * Contacto activo del propietario. Si viene celular: se cierra el activo
   * ANTES de crear el nuevo (el índice único parcial es inmediato, no
   * deferrable). Si no viene: se conserva el activo o se crea `unavailable`.
   */
  private async persistOwnerContact(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    memberId: string,
    phone: { areaCode?: string; nationalNumber?: string } | null | undefined,
  ): Promise<CheckInData['ownerContact']> {
    const areaCode = phone?.areaCode?.trim() || null;
    const nationalNumber = phone?.nationalNumber?.trim() || null;
    const wantsPhone = areaCode !== null || nationalNumber !== null;

    if (wantsPhone) {
      const e164 = buildE164({
        areaCode,
        nationalNumber,
        countryCode: envs.DEFAULT_PHONE_COUNTRY_CODE,
      });
      if (!e164) {
        throw new BadRequestException(
          'Ingresá un celular válido (código de área y número)',
        );
      }

      await tx.vehicleOwnerContact.updateMany({
        where: { vehicleId, isActive: true },
        data: { isActive: false },
      });

      await tx.vehicleOwnerContact.create({
        data: {
          vehicleId,
          phoneE164: e164,
          phoneAreaCode: (areaCode ?? '').replace(/\D/g, '') || null,
          phoneNationalNumber:
            (nationalNumber ?? '').replace(/\D/g, '') || null,
          status: 'available',
          source: 'workshop_counter',
          recordedByMemberId: memberId,
        },
      });

      return { status: 'available', phoneMasked: maskPhone(e164) };
    }

    const active = await tx.vehicleOwnerContact.findFirst({
      where: { vehicleId, isActive: true },
      select: { status: true, phoneE164: true },
    });
    if (active) {
      return {
        status: active.status,
        phoneMasked: maskPhone(active.phoneE164),
      };
    }

    await tx.vehicleOwnerContact.create({
      data: {
        vehicleId,
        status: 'unavailable',
        source: 'workshop_counter',
        recordedByMemberId: memberId,
      },
    });

    return { status: 'unavailable', phoneMasked: null };
  }

  /** meta.target de un P2002 (acepta nombre Prisma o de columna). */
  private uniqueTarget(error: unknown): string[] {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta as { target?: unknown })?.target;
      return Array.isArray(target) ? target.map(String) : [];
    }
    return [];
  }
}
