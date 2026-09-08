import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { UpdateMemberRoleCommand } from './update-member-role.command';

@Injectable()
export class UpdateMemberRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: UpdateMemberRoleCommand) {
    const member = await this.prisma.workshopMember.findUnique({
      where: { id: command.memberId },
    });
    if (!member) {
      throw new NotFoundException('WorkshopMember', command.memberId);
    }

    const targetRole = await this.prisma.workshopRole.findUnique({
      where: { id: command.roleId },
    });
    if (!targetRole || targetRole.workshopId !== member.workshopId) {
      throw new NotFoundException('WorkshopRole', command.roleId);
    }

    // Acting member: the current user's membership within the same workshop.
    // The route is guarded by WorkshopGuard + PermissionsGuard (member.role.update),
    // so this is the authoritative actor for the hierarchy check.
    const actorMember = await this.prisma.workshopMember.findUnique({
      where: {
        workshopId_userId: {
          workshopId: member.workshopId,
          userId: command.actorUserId,
        },
      },
      include: { role: true },
    });
    if (!actorMember || actorMember.status !== 'active') {
      throw new ForbiddenException(
        'You are not an active member of this workshop',
      );
    }

    this.assertHierarchy(actorMember, member, targetRole);

    const updated = await this.prisma.workshopMember.update({
      where: { id: command.memberId },
      data: { roleId: command.roleId },
    });

    // Invalidate the affected user's cached permissions (workshop-scoped and global).
    this.permissionCache.invalidateUser(member.userId);

    return updated;
  }

  /**
   * Workshop role hierarchy — Security Review item 8 (PM decision).
   *
   * Rank order is derived from `WorkshopRole.priority`, where a higher value is a
   * more senior role. System roles seeded are: owner (100) > mechanic (50) >
   * employee (30). Custom workshop roles follow the same `priority` scheme
   * (managed via create-role / update-role).
   *
   * Rules:
   *  1. Owner may assign ANY role (full workshop control).
   *  2. A non-owner cannot assign a role of HIGHER priority than their own
   *     (cannot promote someone above themselves; in particular cannot assign owner).
   *  3. Nobody may change their OWN role to one of equal-or-higher priority
   *     (no auto-promotion; only self-demotion to a strictly lower priority).
   */
  private assertHierarchy(
    actorMember: { userId: string; role: { code: string; priority: number } },
    targetMember: { userId: string },
    targetRole: { code: string; priority: number },
  ): void {
    const actorRole = actorMember.role;
    const isSelf = actorMember.userId === targetMember.userId;

    if (isSelf) {
      // No self-promotion, nor an equal-priority (same rank) change: only a
      // strict demotion to a lower priority is permitted.
      if (targetRole.priority >= actorRole.priority) {
        throw new ForbiddenException(
          'You cannot assign yourself an equal or higher role',
        );
      }
      return;
    }

    // Changing another member.
    if (actorRole.code === 'owner') {
      return; // workshop owner may assign any role
    }

    if (targetRole.priority > actorRole.priority) {
      throw new ForbiddenException(
        'You cannot assign a role with a higher priority than your own',
      );
    }
  }
}
