import { ForbiddenException, Injectable } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetWorkshopHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Security Review #9 (P1): the public /workshops/:id detail route requires an
   * active membership (or platform super_admin). When `userId` is provided the
   * caller must be an active member or super_admin → otherwise 403
   * PERMISSION_DENIED (D-025 envelope). When `userId` is omitted (administration
   * module) the call is already gated by PermissionsGuard (admin.workshops.read).
   */
  async execute(id: string, userId?: string) {
    if (userId) {
      // Super admin bypasses the membership requirement.
      if (!(await this.isSuperAdmin(userId))) {
        const member = await this.prisma.workshopMember.findUnique({
          where: { workshopId_userId: { workshopId: id, userId } },
          select: { status: true },
        });
        if (!member || member.status !== MemberStatus.active) {
          throw new ForbiddenException(
            'You are not authorized to view this workshop',
          );
        }
      }
    }

    const workshop = await this.prisma.workshop.findUnique({
      where: { id },
      include: {
        branches: {
          where: { isActive: true },
          orderBy: { isHeadquarters: 'desc' },
        },
        appointments: { where: { status: 'scheduled' } },

        _count: { select: { members: true, branches: true } },
      },
    });

    if (!workshop) throw new NotFoundException('Workshop', id);
    return workshop;
  }

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const superAdminRole = await this.prisma.systemRole.findUnique({
      where: { type: 'super_admin' },
      select: { id: true },
    });
    if (!superAdminRole) return false;

    const assignment = await this.prisma.systemRoleAssignment.findFirst({
      where: { userId, roleId: superAdminRole.id },
      select: { id: true },
    });

    return !!assignment;
  }
}

