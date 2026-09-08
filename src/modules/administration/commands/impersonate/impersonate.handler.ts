import { NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

const IMPERSONATION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * ImpersonateHandler — Starts an impersonation session.
 *
 * D-016 A1:
 * - deleteMany by adminId WITHOUT expiration filter (deletes all previous rows)
 * - expiresAt = now + 1h
 * - impersonated token signed with exp ≈ 1h aligned to expiresAt
 */
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

    const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);

    // D-016 A1: token exp aligned to expiresAt (floor to seconds).
    // jsonwebtoken v9 throws if payload.exp AND options.expiresIn coexist, and
    // @nestjs/jwt always merges the module-level signOptions.expiresIn, so the
    // exp must be expressed as a per-call expiresIn (in seconds) instead of a
    // payload claim. This yields exp = floor(expiresAt/1000) exactly.
    const expiresInSeconds = Math.max(
      1,
      Math.floor(expiresAt.getTime() / 1000) - Math.floor(Date.now() / 1000),
    );
    const impersonatedToken = this.jwtService.sign(
      {
        sub: targetUserId,
        impersonatedBy: adminUserId,
        impersonated: true,
      },
      { expiresIn: expiresInSeconds },
    );

    await this.prisma.$transaction([
      // D-016 A1: delete ALL previous rows for this admin (no expiration filter)
      this.prisma.impersonationSession.deleteMany({
        where: {
          adminId: adminUserId,
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
