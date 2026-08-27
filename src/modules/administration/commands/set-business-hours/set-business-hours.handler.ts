import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { SetBusinessHoursCommand } from './set-business-hours.command';

@Injectable()
export class SetBusinessHoursHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: SetBusinessHoursCommand) {
    const branch = await this.prisma.workshopBranch.findUnique({
      where: { id: command.branchId },
    });
    if (!branch) {
      throw new NotFoundException('WorkshopBranch', command.branchId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.businessHour.deleteMany({
        where: { branchId: command.branchId },
      });

      await tx.businessHour.createMany({
        data: command.dto.hours.map((h) => ({
          branchId: command.branchId,
          weekday: h.weekday,
          opensAt: new Date(`2000-01-01T${h.opensAt}:00Z`),
          closesAt: new Date(`2000-01-01T${h.closesAt}:00Z`),
        })),
      });
    });

    return this.prisma.businessHour.findMany({
      where: { branchId: command.branchId },
      orderBy: { weekday: 'asc' },
    });
  }
}
