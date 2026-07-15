import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { GrantAccessCommand } from './grant-access.command';

@Injectable()
export class GrantAccessHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: GrantAccessCommand) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: command.vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', command.vehicleId);
    }

    const access = await this.prisma.vehicleAccess.upsert({
      where: {
        vehicleId_userId: {
          vehicleId: command.vehicleId,
          userId: command.dto.userId,
        },
      },
      update: { revokedAt: null },
      create: {
        vehicleId: command.vehicleId,
        userId: command.dto.userId,
        grantedByUserId: command.grantedByUserId,
      },
    });

    if (command.dto.permissionIds?.length) {
      await this.prisma.vehicleAccessPermission.createMany({
        data: command.dto.permissionIds.map((permissionId) => ({
          vehicleAccessId: access.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }

    return access;
  }
}
