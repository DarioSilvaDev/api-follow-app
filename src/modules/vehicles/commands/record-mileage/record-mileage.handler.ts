import { ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MileageSource, Prisma, VehicleAuditAction } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { MileageRecordedEvent } from '../../events/mileage-recorded.event';
import { RecordMileageCommand } from './record-mileage.command';

/**
 * Registro de kilometraje (Gap 1 §6.2 / D-05, D-06, D-02).
 *
 * - `source` se deriva del contexto activo en el servidor (nunca del cliente).
 * - El contexto debe ser `PERSONAL` o `DEALERSHIP`; `WORKSHOP` / `PLATFORM`
 *   fallan cerrado con `403` antes de tocar la base.
 * - La escritura corre en una transacción interactiva con lock de fila sobre
 *   `vehicles` (`FOR UPDATE`) → `max(mileage)` → insert de `VehicleMileage` y
 *   su `VehicleAuditLog`. Un km menor al máximo histórico responde `409`.
 * - El evento se emite **después** del commit.
 */
@Injectable()
export class RecordMileageHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly vehicleAccess: VehicleAccessService,
  ) {}

  async execute(command: RecordMileageCommand) {
    const { vehicleId, dto, context } = command;
    const actorUserId = command.recordedByUserId;

    // Fail-closed por contexto (D-05): solo PERSONAL y DEALERSHIP registran km.
    if (context.type !== 'PERSONAL' && context.type !== 'DEALERSHIP') {
      throw new ForbiddenException(
        'Mileage cannot be recorded in this context',
      );
    }

    // 404 antes de autorizar: un vehículo inexistente no debe responder 403.
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle', vehicleId);
    }

    // Autorización (misma lógica que expone `capabilities`): PERSONAL exige
    // ownership activo; DEALERSHIP exige membresía activa + permiso + titularidad.
    const capabilities = await this.vehicleAccess.getCapabilities({
      vehicleId,
      userId: actorUserId,
      context,
    });
    if (!capabilities.canRecordMileage) {
      throw new ForbiddenException(
        'You are not allowed to record mileage for this vehicle',
      );
    }

    const isDealership = context.type === 'DEALERSHIP';
    const source = isDealership
      ? MileageSource.dealership
      : MileageSource.owner;
    const dealershipId = isDealership ? context.dealershipId : null;
    const dealershipMemberId = isDealership ? context.memberId : null;

    const mileage = await this.prisma.$transaction(async (tx) => {
      // 1) Lock de fila sobre el vehículo: serializa a los escritores que
      //    compiten por este vehículo (D-06). Orden: vehicles → mileages → audit.
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM vehicles WHERE id = ${vehicleId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0) {
        throw new NotFoundException('Vehicle', vehicleId);
      }

      // 2) Máximo histórico (cubierto por @@index([vehicleId, mileage])).
      const aggregate = await tx.vehicleMileage.aggregate({
        where: { vehicleId },
        _max: { mileage: true },
      });
      const previousMax = aggregate._max.mileage ?? null;

      // 3) Invariante de monotonía (D-141 / D-06): 409 si es menor al máximo.
      if (previousMax !== null && dto.mileage < previousMax) {
        throw new CodedHttpException(
          HttpStatus.CONFLICT,
          'Mileage must be greater than or equal to last recorded',
          ERROR_CODES.CONFLICT,
          { mileage: 'km must be greater than or equal to last recorded' },
        );
      }

      // 4) Lectura con atribución completa (D-01).
      const created = await tx.vehicleMileage.create({
        data: {
          vehicleId,
          mileage: dto.mileage,
          source,
          notes: dto.notes,
          recordedAt: new Date(),
          recordedByUserId: actorUserId,
          recordedByDealershipId: dealershipId,
          recordedByDealershipMemberId: dealershipMemberId,
        },
      });

      // 5) Auditoría append-only en la misma transacción (D-02).
      await tx.vehicleAuditLog.create({
        data: {
          vehicleId,
          action: VehicleAuditAction.mileage_recorded,
          field: 'mileage',
          previousValue: previousMax !== null ? String(previousMax) : null,
          newValue: String(dto.mileage),
          actorUserId,
          dealershipId,
          dealershipMemberId,
          contextType: context.type.toLowerCase(),
        },
      });

      return created;
    });

    // Post-commit: EventEmitter2 no participa de la transacción (D-06).
    this.eventEmitter.emit(
      'vehicle.mileage.recorded',
      new MileageRecordedEvent(vehicleId, dto.mileage),
    );

    return mileage;
  }
}
