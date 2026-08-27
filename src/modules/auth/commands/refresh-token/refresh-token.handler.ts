import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';

import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { RefreshTokenCommand } from './refresh-token.command';

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class RefreshTokenHandler {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(
    command: RefreshTokenCommand,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RefreshResult> {
    const revokedSession = await this.authRepository.findRevokedSession(
      command.refreshToken,
    );

    if (revokedSession) {
      await this.authRepository.revokeUserSessions(revokedSession.userId);
      throw new UnauthorizedException(
        'Session compromised. Please login again.',
      );
    }

    const session = await this.authRepository.findSessionByRefreshToken(
      command.refreshToken,
    );

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const payload = { sub: session.userId };
    const accessToken = this.jwtService.sign(payload);
    const newRefreshToken = randomBytes(32).toString('base64url');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.authRepository.revokeSession(session.id);

    await this.authRepository.createSession({
      userId: session.userId,
      refreshToken: newRefreshToken,
      ipAddress,
      userAgent,
      expiresAt,
    });

    return { accessToken, refreshToken: newRefreshToken };
  }
}
