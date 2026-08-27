import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

@Injectable()
export class ListVehiclesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    return this.prisma.vehicle.findMany({
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
          where: { endsAt: null },
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
          take: 1,
        },
        _count: {
          select: { photos: true, documents: true, mileages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
