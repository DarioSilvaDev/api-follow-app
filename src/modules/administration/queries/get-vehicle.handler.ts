import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

@Injectable()
export class GetVehicleHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        version: {
          include: {
            model: {
              include: {
                brand: true,
              },
            },
          },
        },
        ownerships: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { startsAt: 'desc' },
        },
        photos: {
          orderBy: { isPrimary: 'desc' },
        },
        _count: {
          select: { documents: true, mileages: true },
        },
      },
    });

    if (!vehicle) throw new NotFoundException('Vehicle', vehicleId);

    return vehicle;
  }
}
