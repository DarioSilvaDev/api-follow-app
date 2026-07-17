import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { RemoveMemberCommand } from './remove-member.command';

@Injectable()
export class RemoveMemberHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: RemoveMemberCommand) {
    const member = await this.prisma.workshopMember.findUnique({
      where: { id: command.memberId },
    });
    if (!member)
      throw new NotFoundException('WorkshopMember', command.memberId);

    await this.prisma.workshopMember.update({
      where: { id: command.memberId },
      data: { status: 'inactive', leftAt: new Date() },
    });

    this.permissionCache.invalidateUser(member.userId);
  }
}
