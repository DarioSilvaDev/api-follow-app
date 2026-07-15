import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetVehicleServiceHistoryHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle', vehicleId);

    const [serviceRecords, workOrders, estimates, appointments] =
      await Promise.all([
        this.prisma.serviceRecord.findMany({
          where: { vehicleId },
          include: { workshop: { select: { id: true, name: true } } },
          orderBy: { serviceDate: 'desc' },
        }),
        this.prisma.workOrder.findMany({
          where: { vehicleId },
          include: { _count: { select: { items: true } } },
          orderBy: { openedAt: 'desc' },
          take: 20,
        }),
        this.prisma.estimate.findMany({
          where: { vehicleId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.appointment.findMany({
          where: { vehicleId, status: { not: 'cancelled' } },
          orderBy: { scheduledFor: 'desc' },
          take: 10,
        }),
      ]);

    return { serviceRecords, workOrders, estimates, appointments };
  }
}
