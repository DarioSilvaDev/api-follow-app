import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { DeleteUserCommand } from './delete-user.command';
import { UserDeletedEvent } from '../../events/user-deleted.event';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';

@Injectable()
export class DeleteUserHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: DeleteUserCommand, currentUser: AuthenticatedUser) {
    if (command.userId === currentUser.id) {
      throw new BadRequestException('Cannot delete your own account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: command.userId },
    });
    if (!user) throw new NotFoundException('User', command.userId);

    const isTargetSuperAdmin = await this.isSuperAdmin(command.userId);
    if (isTargetSuperAdmin) {
      const superAdminCount = await this.countSuperAdmins();
      if (superAdminCount <= 1) {
        throw new BadRequestException(
          'Cannot delete the last super admin in the system',
        );
      }

      const isCurrentSuperAdmin = await this.isSuperAdmin(currentUser.id);
      if (!isCurrentSuperAdmin) {
        throw new ForbiddenException(
          'Only super admins can delete a super admin',
        );
      }
    }

    await this.prisma.user.update({
      where: { id: command.userId },
      data: { deletedAt: new Date() },
    });

    this.eventEmitter.emit(
      'admin.user.deleted',
      new UserDeletedEvent(command.userId),
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
