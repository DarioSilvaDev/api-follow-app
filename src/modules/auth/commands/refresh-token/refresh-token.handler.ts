import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';

import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { RefreshTokenCommand } from './refresh-token.command';
import { PrismaService } from '../../../../common/database/prisma.service';
import { hashRefreshToken } from '../../utils/token-hash.util';
import { SessionExpiredException } from '../../../../common/exceptions/coded.exception';

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  impersonated: boolean;
}

type RotationOutcome =
  | { outcome: 'invalid' }
  | { outcome: 'reuse'; userId: string }
  | { outcome: 'win'; session: { id: string; userId: string } };

@Injectable()
export class RefreshTokenHandler {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    command: RefreshTokenCommand,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RefreshResult> {
    const now = new Date();
    const tokenHash = hashRefreshToken(command.refreshToken);

    // ── Atomic compare-and-swap (TOCTOU fix, Security Review #3) ──
    // Rotates the refresh session with a conditional update by token hash so
    // that only ONE of two concurrent refreshes with the same token wins the
    // race. The loser is treated as a reuse and triggers compromise detection.
    //
    // The single-row rotation is performed inside a transaction; the
    // revoke-all on reuse runs OUTSIDE the transaction so that it persists
    // (an interactive transaction rolls back on throw).
    const rotation = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.userSession.findFirst({
        where: { refreshTokenHash: tokenHash },
      });

      if (!existing) {
        return { outcome: 'invalid' } as const;
      }

      if (existing.revokedAt) {
        // Token already rotated by a previous/winning call → reuse.
        return { outcome: 'reuse', userId: existing.userId } as const;
      }

      const rotated = await tx.userSession.updateMany({
        where: {
          id: existing.id,
          revokedAt: null, // compare: only wins if still active
          expiresAt: { gt: now },
        },
        data: { revokedAt: now }, // swap to revoked (rotate)
      });

      if (rotated.count !== 1) {
        // Expired, or lost a concurrent rotation race → reuse.
        return {
          outcome: existing.expiresAt <= now ? 'invalid' : 'reuse',
          userId: existing.userId,
        } as const;
      }

      return { outcome: 'win', session: existing } as const;
    });

    if (rotation.outcome === 'invalid') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (rotation.outcome === 'reuse') {
      await this.prisma.userSession.updateMany({
        where: { userId: rotation.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException(
        'Session compromised. Please login again.',
      );
    }

    // Exhaustive narrowing: both 'invalid' and 'reuse' throw above.
    // This guard is required because TS loses the discriminated-union
    // narrowing through prisma.$transaction's return type.
    if (rotation.outcome !== 'win') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = rotation.session;

    // ── D-016 A1: Impersonation refresh ──
    const impersonationSession =
      await this.prisma.impersonationSession.findFirst({
        where: {
          adminId: session.userId,
          expiresAt: { gt: now },
        },
        include: {
          admin: { select: { id: true, status: true } },
        },
      });

    if (impersonationSession) {
      // Admin must still be active
      if (impersonationSession.admin.status !== 'active') {
        // Rotate to a replacement session (the presented one was already
        // rotated above) but don't issue tokens.
        const newRefreshToken = randomBytes(32).toString('base64url');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await this.authRepository.createSession({
          userId: session.userId,
          refreshToken: newRefreshToken,
          ipAddress,
          userAgent,
          expiresAt,
        });
        throw new SessionExpiredException();
      }

      // Re-issue impersonated token with exp = end of the absolute window.
      const expiresInSeconds = Math.max(
        1,
        Math.floor(impersonationSession.expiresAt.getTime() / 1000) -
          Math.floor(Date.now() / 1000),
      );
      const impersonatedAccessToken = this.jwtService.sign(
        {
          sub: impersonationSession.targetUserId,
          impersonatedBy: session.userId,
          impersonated: true,
        },
        { expiresIn: expiresInSeconds },
      );

      const newRefreshToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await this.authRepository.createSession({
        userId: session.userId,
        refreshToken: newRefreshToken,
        ipAddress,
        userAgent,
        expiresAt,
      });

      return {
        accessToken: impersonatedAccessToken,
        refreshToken: newRefreshToken,
        impersonated: true,
      };
    }

    // ── Normal refresh (no impersonation or impersonation expired) ──
    const payload = { sub: session.userId };
    const accessToken = this.jwtService.sign(payload);
    const newRefreshToken = randomBytes(32).toString('base64url');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.authRepository.createSession({
      userId: session.userId,
      refreshToken: newRefreshToken,
      ipAddress,
      userAgent,
      expiresAt,
    });

    return { accessToken, refreshToken: newRefreshToken, impersonated: false };
  }
}
