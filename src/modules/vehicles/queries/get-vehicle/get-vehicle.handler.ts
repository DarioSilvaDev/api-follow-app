import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetVehicleHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
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
        photos: true,
        documents: true,
        mileages: { orderBy: { recordedAt: 'desc' }, take: 5 },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', id);
    }

    return vehicle;
  }
}
