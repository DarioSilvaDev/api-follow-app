import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { UpdateMemberRoleCommand } from './update-member-role.command';

@Injectable()
export class UpdateMemberRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: UpdateMemberRoleCommand) {
    const member = await this.prisma.workshopMember.findUnique({
      where: { id: command.memberId },
    });
    if (!member || member.status === 'inactive') {
      throw new NotFoundException('WorkshopMember', command.memberId);
    }

    const role = await this.prisma.workshopRole.findUnique({
      where: { id: command.roleId },
    });
    if (!role || role.workshopId !== member.workshopId) {
      throw new BadRequestException(
        'Role does not belong to the same workshop',
      );
    }

    const updated = await this.prisma.workshopMember.update({
      where: { id: command.memberId },
      data: { roleId: command.roleId },
    });

    this.permissionCache.invalidate(`${member.userId}:${member.workshopId}`);

    return updated;
  }
}
