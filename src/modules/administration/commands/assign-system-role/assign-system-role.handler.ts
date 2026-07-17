import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { SystemRoleAssignedEvent } from '../../events/system-role-assigned.event';
import { AssignSystemRoleCommand } from './assign-system-role.command';

@Injectable()
export class AssignSystemRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: AssignSystemRoleCommand) {
    const user = await this.prisma.user.findUnique({
      where: { id: command.userId },
    });
    if (!user) throw new NotFoundException('User', command.userId);

    const role = await this.prisma.systemRole.findUnique({
      where: { type: command.roleType },
    });
    if (!role)
      throw new NotFoundException('SystemRole', command.roleType);

    const existing = await this.prisma.systemRoleAssignment.findUnique({
      where: {
        userId_roleId: { userId: command.userId, roleId: role.id },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `User already has the ${command.roleType} role`,
      );
    }

    const assignment = await this.prisma.systemRoleAssignment.create({
      data: {
        userId: command.userId,
        roleId: role.id,
      },
    });

    this.eventEmitter.emit(
      'admin.system_role.assigned',
      new SystemRoleAssignedEvent(command.userId, command.roleType),
    );

    this.permissionCache.invalidateUser(command.userId);

    return assignment;
  }
}
