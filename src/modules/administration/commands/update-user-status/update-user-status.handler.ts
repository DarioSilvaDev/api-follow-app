import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { UpdateUserStatusCommand } from './update-user-status.command';
import { UserStatusChangedEvent } from '../../events/user-status-changed.event';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';

@Injectable()
export class UpdateUserStatusHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(
    command: UpdateUserStatusCommand,
    currentUser: AuthenticatedUser,
  ) {
    if (command.userId === currentUser.id) {
      throw new BadRequestException('Cannot change your own status');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: command.userId },
    });
    if (!user) throw new NotFoundException('User', command.userId);

    const isTargetSuperAdmin = await this.isSuperAdmin(command.userId);
    if (isTargetSuperAdmin) {
      throw new ForbiddenException('Cannot change status of a super admin');
    }

    await this.prisma.user.update({
      where: { id: command.userId },
      data: { status: command.status },
    });

    this.eventEmitter.emit(
      'admin.user.status_changed',
      new UserStatusChangedEvent(command.userId, command.status),
    );

    this.permissionCache.invalidateUser(command.userId);
  }

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const role = await this.prisma.systemRole.findUnique({
      where: { type: 'super_admin' },
    });
    if (!role) return false;

    const assignment = await this.prisma.systemRoleAssignment.findUnique({
      where: {
        userId_roleId: { userId, roleId: role.id },
      },
    });
    return !!assignment;
  }
}
