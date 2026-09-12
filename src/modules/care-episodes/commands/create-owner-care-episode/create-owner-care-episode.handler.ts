import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import type { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import { CareEpisodeCreatedEvent } from '../../events/care-episode-created.event';
import { CreateOwnerCareEpisodeCommand } from './create-owner-care-episode.command';

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
 */
@Injectable()
export class CreateOwnerCareEpisodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleAccessService: VehicleAccessService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CreateOwnerCareEpisodeCommand, ctx: CurrentContext) {
    // RF-1: el handler exige contexto PERSONAL (la ruta /owner es OWNER por
    // definición — D-063). WORKSHOP/PLATFORM → 403.
    if (ctx.type !== 'PERSONAL') {
      throw new ForbiddenException(
        'Owner care episodes can only be created in a PERSONAL context',
      );
    }

    const { dto, user } = command;
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

    // ── Persist (RF-1: nacimiento owner = delivered + unverified) ──
    const careEpisode = await this.prisma.careEpisode.create({
      data: {
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
      },
    });

    // ── Evento: emitido después del éxito (payload extendido, D-063) ──
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

    return careEpisode;
  }
}
