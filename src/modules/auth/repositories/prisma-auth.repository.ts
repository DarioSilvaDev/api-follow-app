import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  hashRefreshToken,
  hashPasswordResetToken,
} from '../utils/token-hash.util';
import { AuthRepository } from './auth.repository';

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(data: {
    userId: string;
    refreshToken: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { refreshToken, ...rest } = data;
    return this.prisma.userSession.create({
      data: {
        ...rest,
        refreshTokenHash: hashRefreshToken(refreshToken),
      },
    });
  }

  async findSessionByRefreshToken(refreshToken: string) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        refreshTokenHash: hashRefreshToken(refreshToken),
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return session;
  }

  async findRevokedSession(refreshToken: string) {
    return this.prisma.userSession.findFirst({
      where: {
        refreshTokenHash: hashRefreshToken(refreshToken),
        revokedAt: { not: null },
      },
    });
  }

  async revokeSession(id: string) {
    await this.prisma.userSession.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeUserSessions(userId: string) {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async createPasswordReset(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }) {
    return this.prisma.passwordReset.create({
      data: {
        userId: data.userId,
        tokenHash: hashPasswordResetToken(data.token),
        expiresAt: data.expiresAt,
      },
    });
  }

  async findPasswordResetByToken(token: string) {
    return this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashPasswordResetToken(token) },
    });
  }

  async markPasswordResetUsed(id: string) {
    await this.prisma.passwordReset.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async revokeUnusedPasswordResets(userId: string) {
    await this.prisma.passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Opportunistic cleanup (D-033): physically deletes password reset tokens of
   * a user that are no longer usable — already used, already revoked (in this
   * model revocation is represented by `usedAt` per D-027) or expired.
   *
   * Must run BEFORE creating a new token so the freshly created token is never
   * deleted. No cron/scheduled job: this is opportunistic hygiene inside
   * the throttled request-password-reset flow.
   */
  async deleteCleanupPasswordResets(userId: string) {
    await this.prisma.passwordReset.deleteMany({
      where: {
        userId,
        OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
      },
    });
  }
}
