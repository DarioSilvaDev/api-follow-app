import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DeleteBranchCommand } from './delete-branch.command';

@Injectable()
export class DeleteBranchHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteBranchCommand) {
    const existing = await this.prisma.workshopBranch.findUnique({
      where: { id: command.branchId },
    });
    if (!existing) {
      throw new NotFoundException('WorkshopBranch', command.branchId);
    }

    await this.prisma.workshopBranch.update({
      where: { id: command.branchId },
      data: { isActive: false },
    });
  }
}
