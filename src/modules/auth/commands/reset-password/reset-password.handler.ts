import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { ResetPasswordCommand } from './reset-password.command';
import { PasswordResetCompletedEvent } from '../../events/password-reset-completed.event';
import { createModuleLoggerToken } from '../../../../common/logger/create-module-logger';

@Injectable()
export class ResetPasswordHandler {
  constructor(
    @Inject(createModuleLoggerToken('Auth'))
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: ResetPasswordCommand) {
    const reset = await this.authRepository.findPasswordResetByToken(
      command.token,
    );

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new UnauthorizedException('Enlace inválido o expirado');
    }

    const passwordHash = await bcrypt.hash(command.password, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { userId: reset.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      });

      await tx.userSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    this.logger.info({
      message: 'Password reset completed',
      userId: reset.userId,
    });

    this.eventEmitter.emit(
      'auth.password_reset.completed',
      new PasswordResetCompletedEvent(reset.userId),
    );
  }
}
