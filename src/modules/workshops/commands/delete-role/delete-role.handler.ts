import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DeleteRoleCommand } from './delete-role.command';

@Injectable()
export class DeleteRoleHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteRoleCommand) {
    const role = await this.prisma.workshopRole.findFirst({
      where: { id: command.roleId, workshopId: command.workshopId },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new ForbiddenException('Cannot delete system roles');
    }

    const memberCount = await this.prisma.workshopMember.count({
      where: { roleId: command.roleId },
    });
    if (memberCount > 0) {
      throw new BadRequestException(
        'Cannot delete role with active members. Reassign members first.',
      );
    }

    await this.prisma.workshopRole.delete({ where: { id: command.roleId } });
  }
}
