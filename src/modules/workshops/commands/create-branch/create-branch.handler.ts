import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CreateBranchCommand } from './create-branch.command';

@Injectable()
export class CreateBranchHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateBranchCommand) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { id: command.workshopId },
    });
    if (!workshop) throw new NotFoundException('Workshop', command.workshopId);

    return this.prisma.workshopBranch.create({
      data: {
        workshopId: command.workshopId,
        ...command.dto,
      },
    });
  }
}
