import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { SystemRoleRevokedEvent } from '../../events/system-role-revoked.event';
import { RevokeSystemRoleCommand } from './revoke-system-role.command';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';

@Injectable()
export class RevokeSystemRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(
    command: RevokeSystemRoleCommand,
    currentUser: AuthenticatedUser,
  ) {
    if (command.userId === currentUser.id) {
      throw new BadRequestException('Cannot revoke your own role');
    }

    const role = await this.prisma.systemRole.findUnique({
      where: { id: command.roleId },
    });
    if (!role) throw new NotFoundException('SystemRole', command.roleId);

    if (role.type === 'super_admin') {
      const isSuperAdmin = await this.isSuperAdmin(currentUser.id);
      if (!isSuperAdmin) {
        throw new ForbiddenException(
          'Only super admins can revoke the super_admin role',
        );
      }

      const superAdminCount = await this.countSuperAdmins();
      if (superAdminCount <= 1) {
        throw new BadRequestException(
          'Cannot revoke the last super admin in the system',
        );
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: command.userId },
    });
    if (!user) throw new NotFoundException('User', command.userId);

    const assignment = await this.prisma.systemRoleAssignment.findUnique({
      where: {
        userId_roleId: { userId: command.userId, roleId: role.id },
      },
    });
    if (!assignment) {
      throw new NotFoundException(
        'SystemRoleAssignment',
        `${command.userId}:${role.type}`,
      );
    }

    await this.prisma.systemRoleAssignment.delete({
      where: { id: assignment.id },
    });

    this.eventEmitter.emit(
      'admin.system_role.revoked',
      new SystemRoleRevokedEvent(command.userId, role.type),
    );

    this.permissionCache.invalidateUser(command.userId);
  }

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const role = await this.prisma.systemRole.findUnique({
      where: { type: 'super_admin' },
    });
    if (!role) return false;

    const assignment = await this.prisma.systemRoleAssignment.findUnique({
      where: { userId_roleId: { userId, roleId: role.id } },
    });
    return !!assignment;
  }

  private async countSuperAdmins(): Promise<number> {
    const role = await this.prisma.systemRole.findUnique({
      where: { type: 'super_admin' },
    });
    if (!role) return 0;

    return this.prisma.systemRoleAssignment.count({
      where: { roleId: role.id },
    });
  }
}
