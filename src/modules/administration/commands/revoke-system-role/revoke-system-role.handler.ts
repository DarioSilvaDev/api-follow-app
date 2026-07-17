import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { SystemRoleRevokedEvent } from '../../events/system-role-revoked.event';
import { RevokeSystemRoleCommand } from './revoke-system-role.command';

@Injectable()
export class RevokeSystemRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: RevokeSystemRoleCommand) {
    const role = await this.prisma.systemRole.findUnique({
      where: { type: command.roleType },
    });
    if (!role)
      throw new NotFoundException('SystemRole', command.roleType);

    const assignment = await this.prisma.systemRoleAssignment.findUnique({
      where: {
        userId_roleId: { userId: command.userId, roleId: role.id },
      },
    });
    if (!assignment) {
      throw new NotFoundException(
        'SystemRoleAssignment',
        `${command.userId}:${command.roleType}`,
      );
    }

    await this.prisma.systemRoleAssignment.delete({
      where: { id: assignment.id },
    });

    this.eventEmitter.emit(
      'admin.system_role.revoked',
      new SystemRoleRevokedEvent(command.userId, command.roleType),
    );

    this.permissionCache.invalidateUser(command.userId);
  }
}
