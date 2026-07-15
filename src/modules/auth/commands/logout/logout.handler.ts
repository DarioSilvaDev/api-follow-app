import { Inject, Injectable } from '@nestjs/common';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { LogoutCommand } from './logout.command';

@Injectable()
export class LogoutHandler {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: LogoutCommand) {
    const session = await this.authRepository.findSessionByRefreshToken(
      command.refreshToken,
    );
    if (session) {
      await this.authRepository.revokeSession(session.id);
    }
  }
}
