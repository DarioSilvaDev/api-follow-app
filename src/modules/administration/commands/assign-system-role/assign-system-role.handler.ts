import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { SystemRoleAssignedEvent } from '../../events/system-role-assigned.event';
import { AssignSystemRoleCommand } from './assign-system-role.command';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';

@Injectable()
export class AssignSystemRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(
    command: AssignSystemRoleCommand,
    currentUser: AuthenticatedUser,
  ) {
    const role = await this.prisma.systemRole.findUnique({
      where: { id: command.roleId },
    });
    if (!role) throw new NotFoundException('SystemRole', command.roleId);

    if (role.type === 'super_admin') {
      const isSuperAdmin = await this.isSuperAdmin(currentUser.id);
      if (!isSuperAdmin) {
        throw new ForbiddenException(
          'Only super admins can assign the super_admin role',
        );
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: command.userId },
    });
    if (!user) throw new NotFoundException('User', command.userId);

    const existing = await this.prisma.systemRoleAssignment.findUnique({
      where: {
        userId_roleId: { userId: command.userId, roleId: role.id },
      },
    });
    if (existing) {
      throw new BadRequestException(`User already has the ${role.type} role`);
    }

    const assignment = await this.prisma.systemRoleAssignment.create({
      data: {
        userId: command.userId,
        roleId: role.id,
      },
    });

    this.eventEmitter.emit(
      'admin.system_role.assigned',
      new SystemRoleAssignedEvent(command.userId, role.type),
    );

    this.permissionCache.invalidateUser(command.userId);

    return assignment;
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
}
