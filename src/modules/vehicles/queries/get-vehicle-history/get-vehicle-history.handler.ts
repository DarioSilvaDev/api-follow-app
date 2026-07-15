import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetVehicleHistoryHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', vehicleId);
    }

    const [transfers, mileages, ownerships] = await Promise.all([
      this.prisma.vehicleTransfer.findMany({
        where: { vehicleId },
        include: {
          fromUser: { select: { id: true, firstName: true, lastName: true } },
          toUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicleMileage.findMany({
        where: { vehicleId },
        orderBy: { recordedAt: 'desc' },
      }),
      this.prisma.vehicleOwnership.findMany({
        where: { vehicleId },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { startsAt: 'desc' },
      }),
    ]);

    return { transfers, mileages, ownerships };
  }
}
