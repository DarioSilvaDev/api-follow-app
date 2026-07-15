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
    if (!branch)
      throw new NotFoundException('WorkshopBranch', command.branchId);

    await this.prisma.businessHour.deleteMany({
      where: { branchId: command.branchId },
    });

    if (command.dto.hours.length > 0) {
      await this.prisma.businessHour.createMany({
        data: command.dto.hours.map((h) => ({
          branchId: command.branchId,
          weekday: h.weekday,
          opensAt: new Date(`1970-01-01T${h.opensAt}:00`),
          closesAt: new Date(`1970-01-01T${h.closesAt}:00`),
        })),
      });
    }

    return this.prisma.businessHour.findMany({
      where: { branchId: command.branchId },
      orderBy: { weekday: 'asc' },
    });
  }
}
