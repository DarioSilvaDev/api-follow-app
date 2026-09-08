import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { RoleService } from '../../services/role.service';

@Injectable()
export class GetSessionHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleService: RoleService,
  ) {}

  async execute(
    userId: string,
    impersonation?: { impersonated?: boolean; impersonatedBy?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        language: true,
        status: true,
        _count: {
          select: {
            ownerships: { where: { endsAt: null } },
          },
        },
        workshopMemberships: {
          where: { status: 'active', leftAt: null },
          select: {
            workshopId: true,
            workshop: { select: { id: true, name: true } },
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const roles = await this.roleService.loadUserRoles(userId, true);

    const { _count, ...userData } = user;

    return {
      ...userData,
      isVehicleOwner: _count.ownerships > 0,
      roles,
      ...(impersonation?.impersonated
        ? {
            impersonated: true,
            impersonatedBy: impersonation.impersonatedBy,
          }
        : {}),
    };
  }
}
