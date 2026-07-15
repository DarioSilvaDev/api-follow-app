import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateMemberRoleCommand } from './update-member-role.command';

@Injectable()
export class UpdateMemberRoleHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateMemberRoleCommand) {
    const member = await this.prisma.workshopMember.findUnique({
      where: { id: command.memberId },
    });
    if (!member)
      throw new NotFoundException('WorkshopMember', command.memberId);

    return this.prisma.workshopMember.update({
      where: { id: command.memberId },
      data: { roleId: command.roleId },
    });
  }
}
