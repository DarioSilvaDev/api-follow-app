import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../common/database/prisma.service';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { ResetPasswordCommand } from './reset-password.command';

@Injectable()
export class ResetPasswordHandler {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: ResetPasswordCommand) {
    const reset = await this.authRepository.findPasswordResetByToken(
      command.token,
    );

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(command.password, 10);

    await this.prisma.userCredential.update({
      where: { userId: reset.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    await this.authRepository.markPasswordResetUsed(reset.id);
    await this.authRepository.revokeUserSessions(reset.userId);
  }
}
