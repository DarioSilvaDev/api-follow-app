import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * StopImpersonateHandler — Ends an impersonation session.
 *
 * D-016 A1:
 * - findFirst WITHOUT expiresAt filter (works post-expiration)
 * - Validates admin is active
 * - Re-signs a fresh admin token (never returns stored adminToken)
 * - Deletes the session row
 * - No row → 404
 */
@Injectable()
export class StopImpersonateHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async execute(adminId: string, targetUserId: string) {
    // D-016 A1: no expiresAt filter — works even after impersonation expired
    const session = await this.prisma.impersonationSession.findFirst({
      where: {
        adminId,
        targetUserId,
      },
    });

    if (!session) {
      throw new NotFoundException('No active impersonation session found');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, status: true },
    });

    if (!admin || admin.status !== 'active') {
      throw new ForbiddenException('Admin user not active');
    }

    // D-016 A1: re-sign a fresh admin token (never return the stored one)
    const adminAccessToken = this.jwtService.sign({ sub: adminId });

    await this.prisma.impersonationSession.delete({
      where: { id: session.id },
    });

    return { adminToken: adminAccessToken };
  }
}
