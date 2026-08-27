import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

const IMPERSONATION_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class ImpersonateHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async execute(targetUserId: string, adminUserId: string, adminToken: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!targetUser || targetUser.status !== 'active') {
      throw new NotFoundException('Target user not found or inactive');
    }

    const roles = await this.prisma.systemRoleAssignment.findMany({
      where: { userId: targetUserId },
      include: { role: { select: { id: true, type: true, name: true } } },
    });

    const impersonatedToken = this.jwtService.sign(
      {
        sub: targetUserId,
        impersonatedBy: adminUserId,
        impersonated: true,
      },
      { expiresIn: '1h' },
    );

    const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.impersonationSession.deleteMany({
        where: {
          adminId: adminUserId,
          expiresAt: { lt: new Date() },
        },
      }),
      this.prisma.impersonationSession.create({
        data: {
          adminId: adminUserId,
          adminToken,
          targetUserId,
          expiresAt,
        },
      }),
    ]);

    return {
      impersonatedToken,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        roles: roles.map((a) => ({
          id: a.role.id,
          type: a.role.type,
          name: a.role.name,
        })),
      },
    };
  }
}
