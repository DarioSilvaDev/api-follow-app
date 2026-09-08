import { ForbiddenException, Injectable } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/constants';

/**
 * ListWorkshopsQuery — Mainly exposes workshops to their active members.
 *
 * Security Review #9 (P1): a user may only list workshops where they hold an
 * active membership. Platform super_admins (system role) may list all workshops.
 * Anyone else is rejected with 403 PERMISSION_DENIED (D-025 envelope).
 */
interface ListWorkshopsQuery {
  userId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListWorkshopsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWorkshopsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * limit;

    // Security Review #9 (P1): when a caller is provided (public /workshops
    // routes) an active membership or platform super_admin is required.
    // When no caller is provided (administration module), navigation is
    // already gated by PermissionsGuard (admin.workshops.list).
    let superAdmin = false;
    if (query.userId) {
      superAdmin = await this.isSuperAdmin(query.userId);
      if (!superAdmin) {
        const member = await this.prisma.workshopMember.findFirst({
          where: { userId: query.userId, status: MemberStatus.active },
          select: { id: true },
        });
        if (!member) {
          throw new ForbiddenException(
            'You are not authorized to list workshops',
          );
        }
      }
    }

    // Super admins (and the admin module without a caller) see all workshops;
    // regular members see only their own.
    const where =
      query.userId && !superAdmin
        ? {
            members: {
              some: { userId: query.userId, status: MemberStatus.active },
            },
          }
        : undefined;

    const [workshops, total] = await Promise.all([
      this.prisma.workshop.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { members: true, branches: true } },
          branches: { where: { isHeadquarters: true }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workshop.count({ where }),
    ]);

    return {
      data: workshops,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Checks whether the user holds the platform super_admin system role.
   */
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
