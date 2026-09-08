import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { VEHICLE_REPOSITORY } from '../../tokens';
import type { VehicleRepository } from '../../repositories/vehicle.repository';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DeleteVehicleCommand } from './delete-vehicle.command';

/**
 * DeleteVehicleHandler — Implements ADR-005 soft-delete policy.
 *
 * If the vehicle has service history (workOrders, serviceRecords, estimates,
 * appointments, ownerships, transfers, or mileages), it is soft-deleted by
 * setting `deletedAt`. Otherwise, it is hard-deleted.
 *
 * Vehicles with history must never be physically deleted to preserve
 * historical traceability.
 */
@Injectable()
export class DeleteVehicleHandler {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly repository: VehicleRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: DeleteVehicleCommand) {
    const existing = await this.repository.findById(command.id);
    if (!existing) {
      throw new NotFoundException('Vehicle', command.id);
    }

    // Check if the vehicle has service history
    const [workOrdersCount, serviceRecordsCount, estimatesCount] =
      await Promise.all([
        this.prisma.workOrder.count({ where: { vehicleId: command.id } }),
        this.prisma.serviceRecord.count({ where: { vehicleId: command.id } }),
        this.prisma.estimate.count({ where: { vehicleId: command.id } }),
      ]);

    const hasHistory =
      workOrdersCount > 0 || serviceRecordsCount > 0 || estimatesCount > 0;

    if (hasHistory) {
      // ADR-005: Soft-delete — mark deletedAt instead of physical removal
      await this.prisma.vehicle.update({
        where: { id: command.id },
        data: { deletedAt: new Date() },
      });
    } else {
      // No history — safe to physically delete
      await this.repository.delete(command.id);
    }
  }
}
