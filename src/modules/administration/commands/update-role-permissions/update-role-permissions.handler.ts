import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { UpdateRolePermissionsCommand } from './update-role-permissions.command';
import { RolePermissionsUpdatedEvent } from '../../events/role-permissions-updated.event';

@Injectable()
export class UpdateRolePermissionsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: UpdateRolePermissionsCommand) {
    const role = await this.prisma.systemRole.findUnique({
      where: { id: command.roleId },
    });

    if (!role) throw new NotFoundException('SystemRole', command.roleId);

    if (role.type === 'super_admin') {
      throw new BadRequestException(
        'Cannot modify super_admin permissions. Super admin has full access by default.',
      );
    }

    const permissions = await this.prisma.permission.findMany({
      where: { id: { in: command.permissionIds } },
    });

    const foundIds = permissions.map((p) => p.id);
    const missingIds = command.permissionIds.filter(
      (id) => !foundIds.includes(id),
    );
    if (missingIds.length > 0) {
      throw new NotFoundException(
        `Permissions not found: ${missingIds.join(', ')}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.systemRolePermission.deleteMany({
        where: { roleId: command.roleId },
      }),
      this.prisma.systemRolePermission.createMany({
        data: permissions.map((p) => ({
          roleId: command.roleId,
          permissionId: p.id,
        })),
      }),
    ]);

    this.eventEmitter.emit(
      'admin.role.permissions_updated',
      new RolePermissionsUpdatedEvent(
        command.roleId,
        role.type,
        permissions.map((p) => p.code),
      ),
    );

    this.permissionCache.clear();
  }
}
