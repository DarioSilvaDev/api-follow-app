import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetOutgoingTransfersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    return this.prisma.vehicleTransfer.findMany({
      where: { fromUserId: userId },
      include: {
        vehicle: {
          select: {
            id: true,
            licensePlate: true,
            manufactureYear: true,
            modelYear: true,
            color: true,
          },
        },
        toUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
