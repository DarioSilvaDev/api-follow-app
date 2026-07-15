import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
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
    return this.prisma.userSession.create({ data });
  }

  async findSessionByRefreshToken(refreshToken: string) {
    return this.prisma.userSession.findFirst({
      where: { refreshToken, revokedAt: null },
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
    return this.prisma.passwordReset.create({ data });
  }

  async findPasswordResetByToken(token: string) {
    return this.prisma.passwordReset.findUnique({ where: { token } });
  }

  async markPasswordResetUsed(id: string) {
    await this.prisma.passwordReset.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
