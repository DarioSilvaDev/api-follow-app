import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateWorkshopCommand } from './update-workshop.command';

@Injectable()
export class UpdateWorkshopHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateWorkshopCommand) {
    const existing = await this.prisma.workshop.findUnique({
      where: { id: command.workshopId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Workshop', command.workshopId);
    }

    return this.prisma.workshop.update({
      where: { id: command.workshopId },
      data: command.dto,
    });
  }
}
