import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateRoleCommand } from './update-role.command';

@Injectable()
export class UpdateRoleHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateRoleCommand) {
    const role = await this.prisma.dealershipRole.findFirst({
      where: { id: command.roleId, dealershipId: command.dealershipId },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new ForbiddenException('Cannot modify system roles');
    }

    const data: Record<string, unknown> = {};
    if (command.dto.name !== undefined) data.name = command.dto.name;
    if (command.dto.description !== undefined)
      data.description = command.dto.description;
    if (command.dto.priority !== undefined)
      data.priority = command.dto.priority;

    return this.prisma.$transaction(async (tx) => {
      if (command.dto.permissionCodes !== undefined) {
        await tx.dealershipRolePermission.deleteMany({
          where: { roleId: command.roleId },
        });

        const permissions = await tx.permission.findMany({
          where: { code: { in: command.dto.permissionCodes } },
        });

        if (permissions.length > 0) {
          await tx.dealershipRolePermission.createMany({
            data: permissions.map((p) => ({
              roleId: command.roleId,
              permissionId: p.id,
            })),
          });
        }
      }

      return tx.dealershipRole.update({
        where: { id: command.roleId },
        data,
        include: { permissions: { include: { permission: true } } },
      });
    });
  }
}