import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { AddMemberCommand } from './add-member.command';

@Injectable()
export class AddMemberHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: AddMemberCommand) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { id: command.workshopId },
    });
    if (!workshop || workshop.deletedAt) {
      throw new NotFoundException('Workshop', command.workshopId);
    }

    const user = await this.prisma.user.findUnique({
      where: { email: command.dto.email },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User', `email ${command.dto.email}`);
    }

    const existing = await this.prisma.workshopMember.findUnique({
      where: {
        workshopId_userId: { workshopId: command.workshopId, userId: user.id },
      },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this workshop');
    }

    const role = await this.prisma.workshopRole.findUnique({
      where: { id: command.dto.roleId },
    });
    if (!role || role.workshopId !== command.workshopId) {
      throw new NotFoundException('Role', command.dto.roleId);
    }

    const member = await this.prisma.workshopMember.create({
      data: {
        workshopId: command.workshopId,
        userId: user.id,
        roleId: role.id,
        status: 'active',
        joinedAt: new Date(),
      },
    });

    this.permissionCache.invalidate(`${user.id}:${command.workshopId}`);

    return member;
  }
}
