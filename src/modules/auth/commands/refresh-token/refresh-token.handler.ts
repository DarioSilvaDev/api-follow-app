import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuid } from 'uuid';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { RefreshTokenCommand } from './refresh-token.command';

@Injectable()
export class RefreshTokenHandler {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(command: RefreshTokenCommand) {
    const session = await this.authRepository.findSessionByRefreshToken(
      command.refreshToken,
    );

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const payload = { sub: session.userId };
    const accessToken = this.jwtService.sign(payload);
    const newRefreshToken = uuid();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.authRepository.revokeSession(session.id);

    await this.authRepository.createSession({
      userId: session.userId,
      refreshToken: newRefreshToken,
      expiresAt,
    });

    return { accessToken, refreshToken: newRefreshToken };
  }
}
