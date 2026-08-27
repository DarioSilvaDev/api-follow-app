import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class ListPhotosHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return this.prisma.vehiclePhoto.findMany({
      where: { vehicleId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
