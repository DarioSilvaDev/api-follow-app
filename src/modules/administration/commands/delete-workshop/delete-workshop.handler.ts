import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DeleteWorkshopCommand } from './delete-workshop.command';

@Injectable()
export class DeleteWorkshopHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteWorkshopCommand) {
    const existing = await this.prisma.workshop.findUnique({
      where: { id: command.workshopId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Workshop', command.workshopId);
    }

    await this.prisma.workshop.update({
      where: { id: command.workshopId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }
}
