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
          select: { id: true, firstName: true, lastName: true },
        },
        toUser: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // D-078: symmetric contract `{ id, firstName, lastName, alias }`.
    // `User.alias` does not exist in the schema until Phase 2, so it is
    // injected post-query (the Prisma select MUST NOT include `alias`).
    return items.map((t) => ({
      ...t,
      fromUser: { ...t.fromUser, alias: null },
      toUser: { ...t.toUser, alias: null },
    }));
  }
}
