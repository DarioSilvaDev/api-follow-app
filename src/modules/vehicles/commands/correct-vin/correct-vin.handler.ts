import { ForbiddenException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, VehicleAuditAction } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { normalizeVin } from '../../../../common/validation/vin';
import { VehicleVinCorrectedEvent } from '../../events/vin-corrected.event';
import { CorrectVinCommand } from './correct-vin.command';

@Injectable()
export class CorrectVinHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly vehicleAccess: VehicleAccessService,
  ) {}

  async execute(command: CorrectVinCommand) {
    const { vehicleId, dto, actorUserId, context } = command;
    const reason = dto.reason;
    const newVin = normalizeVin(dto.vin);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, vin: true, deletedAt: true },
    });
    if (!vehicle || vehicle.deletedAt) {
      throw new NotFoundException('Vehicle', vehicleId);
    }

    const capabilities = await this.vehicleAccess.getCapabilities({
      vehicleId,
      userId: actorUserId,
      context,
    });
    if (!capabilities.canCorrectVin) {
      throw new ForbiddenException(
        'You are not allowed to correct VIN for this vehicle',
      );
    }

    const existingByVin = await this.prisma.vehicle.findUnique({
      where: { vin: newVin },
      select: { id: true },
    });
    if (existingByVin && existingByVin.id !== vehicleId) {
      throw new CodedHttpException(
        409,
        'VIN already exists',
        ERROR_CODES.CONFLICT,
        { vin: 'vin already exists' },
      );
    }

    const previousValue = vehicle.vin;

    // D-146: la atribución de auditoría se deriva del contexto activo en el
    // servidor (nunca del cliente). PERSONAL → actor persona; DEALERSHIP →
    // miembro de la concesionaria (owner/admin titular, D-144).
    const isDealership = context?.type === 'DEALERSHIP';
    const dealershipId =
      context && context.type === 'DEALERSHIP' ? context.dealershipId : null;
    const dealershipMemberId =
      context && context.type === 'DEALERSHIP' ? context.memberId : null;
    const contextType = (context?.type ?? 'PERSONAL').toLowerCase();

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM vehicles WHERE id = ${vehicleId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0) {
        throw new NotFoundException('Vehicle', vehicleId);
      }

      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { vin: newVin },
      });

      const vehicleWithRelations = await tx.vehicle.findUnique({
        where: { id: vehicleId },
        include: {
          version: { include: { model: { include: { brand: true } } } },
          ownerships: {
            where: { endsAt: null },
          },
        },
      });

      if (!vehicleWithRelations) {
        throw new NotFoundException('Vehicle', vehicleId);
      }

      await tx.vehicleAuditLog.create({
        data: {
          vehicleId,
          action: VehicleAuditAction.vin_corrected,
          field: 'vin',
          previousValue,
          newValue: newVin,
          reason,
          actorUserId,
          dealershipId,
          dealershipMemberId,
          contextType,
        },
      });

      return vehicleWithRelations;
    });

    this.eventEmitter.emit(
      'vehicle.vin.corrected',
      new VehicleVinCorrectedEvent(vehicleId, previousValue, newVin),
    );

    return updated;
  }
}

