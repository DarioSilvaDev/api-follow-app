import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetOutgoingTransfersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    const items = await this.prisma.vehicleTransfer.findMany({
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
        fromUser: {
          select: { id: true, firstName: true, lastName: true, alias: true },
        },
        toUser: {
          select: { id: true, firstName: true, lastName: true, alias: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // D-078: symmetric contract `{ id, firstName, lastName, alias }`.
    // `alias` viene del modelo (Fase 2); null si el usuario no tiene alias.
    return items;
  }
}
