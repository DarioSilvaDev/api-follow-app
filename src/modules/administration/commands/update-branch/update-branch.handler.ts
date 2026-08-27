import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateBranchCommand } from './update-branch.command';

@Injectable()
export class UpdateBranchHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateBranchCommand) {
    const existing = await this.prisma.workshopBranch.findUnique({
      where: { id: command.branchId },
    });
    if (!existing) {
      throw new NotFoundException('WorkshopBranch', command.branchId);
    }

    return this.prisma.workshopBranch.update({
      where: { id: command.branchId },
      data: command.dto,
    });
  }
}
