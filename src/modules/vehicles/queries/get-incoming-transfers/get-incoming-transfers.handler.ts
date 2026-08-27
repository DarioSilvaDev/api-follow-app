import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetIncomingTransfersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    return this.prisma.vehicleTransfer.findMany({
      where: { toUserId: userId },
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
        fromUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
